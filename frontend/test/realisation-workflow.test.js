import test from "node:test";
import assert from "node:assert/strict";
import { buildRealisationDraft, buildRealisationPayload, getParticipantSessionDays, getSessionAttendanceIds, getSessionParticipantIds, resolveSessionIdForRealisation } from "../src/lib/realisation-workflow.js";

const sessions = [
  { id:"2026-09-04-midi", date:"2026-09-04", slot:"midi", status:"encadree", encadrantId:"e1", participantIds:["p1"] },
  { id:"2026-09-05-soir", date:"2026-09-05", slot:"soir", status:"libre", referentId:"r1", participantIds:["p1"] },
];

test("les jours et la séance de réalisation proviennent de l'inscription explicite", () => {
  assert.deepEqual(getParticipantSessionDays(sessions, "p1"), ["2026-09-05", "2026-09-04"]);
  assert.deepEqual(getParticipantSessionDays(sessions, "e1"), []);
  assert.deepEqual(getParticipantSessionDays(sessions, "r1"), []);
  assert.equal(resolveSessionIdForRealisation(sessions, "p1", "2026-09-04"), "2026-09-04-midi");
  assert.equal(resolveSessionIdForRealisation(sessions, "e1", "2026-09-04"), "");
  assert.equal(resolveSessionIdForRealisation(sessions, "r1", "2026-09-05"), "");

  const registeredRoles = [
    { ...sessions[0], participantIds: ["p1", "e1"] },
    { ...sessions[1], participantIds: ["p1", "r1"] },
  ];
  assert.deepEqual(getParticipantSessionDays(registeredRoles, "e1"), ["2026-09-04"]);
  assert.deepEqual(getParticipantSessionDays(registeredRoles, "r1"), ["2026-09-05"]);
});

test("le draft sépare le mode du critère", () => {
  const draft = buildRealisationDraft({ previous:{ modeRealisation:"en_tete", styleRealisation:"flash" }, route:{ moulinetteOnly:true }, routeId:"v1" });
  assert.equal(draft.modeRealisation, "moulinette");
  assert.equal(draft.styleRealisation, "flash");
});

test("le payload transporte explicitement modeRealisation", () => {
  const payload = buildRealisationPayload({ draft:{ participantId:"p1", voieId:"v1", selectedDay:"2026-09-05", modeRealisation:"moulinette", styleRealisation:"a_vue", rating:5 }, sessionId:"s1", now:() => 42 });
  assert.equal(payload.id, "realisation-42");
  assert.equal(payload.modeRealisation, "moulinette");
  assert.equal(payload.styleRealisation, "a_vue");
  assert.equal(payload.rating, 5);
  assert.equal("participantId" in payload, false);
});

test("participantIds reste explicite tandis que l'effectif inclut seulement le rôle actif sans doublon", () => {
  const encadree = {
    status: "encadree",
    participantIds:["p1","e1"],
    encadrantId:"e1",
    referentId:"r1",
  };
  const libre = {
    status: "libre",
    participantIds:["p1"],
    encadrantId:"e1",
    referentId:"r1",
  };

  assert.deepEqual(getSessionParticipantIds(encadree), ["p1","e1"]);
  assert.deepEqual(getSessionAttendanceIds(encadree), ["p1","e1"]);
  assert.deepEqual(getSessionAttendanceIds(libre), ["p1","r1"]);
});
