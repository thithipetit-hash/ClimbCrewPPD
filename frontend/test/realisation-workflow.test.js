import test from "node:test";
import assert from "node:assert/strict";
import { buildRealisationDraft, buildRealisationPayload, getParticipantSessionDays, resolveSessionIdForRealisation } from "../src/lib/realisation-workflow.js";

const sessions = [
  { id:"2026-09-04-midi", date:"2026-09-04", slot:"midi", status:"encadree", encadrantId:"e1", participantIds:["p1"] },
  { id:"2026-09-05-soir", date:"2026-09-05", slot:"soir", status:"libre", referentId:"r1", participantIds:["p1"] },
];

test("les jours et la séance de réalisation proviennent des séances gérées", () => {
  assert.deepEqual(getParticipantSessionDays(sessions, "p1"), ["2026-09-05", "2026-09-04"]);
  assert.equal(resolveSessionIdForRealisation(sessions, "p1", "2026-09-04"), "2026-09-04-midi");
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
});
