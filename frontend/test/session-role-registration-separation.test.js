import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  getSessionAttendanceIds,
  isQualifiedSessionSupervisor,
  isSessionManager,
  normalizeSessionRoles,
} from "../../shared/session-rules.js";

const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const sessionCardSource = await readFile(new URL("../src/components/SessionCard.jsx", import.meta.url), "utf8");

test("les rôles encadrant et référent ne sont jamais injectés automatiquement dans les inscrits", () => {
  const updateSessionBlock = appSource.slice(
    appSource.indexOf("function updateSession"),
    appSource.indexOf("function addParticipantToSession"),
  );

  assert.match(updateSessionBlock, /participantIds: \[\.\.\.new Set\(\(patchedSession\.participantIds \|\| \[\]\)\.map\(String\)\)\]/);
  assert.doesNotMatch(updateSessionBlock, /patchedSession\.encadrantId/);
  assert.doesNotMatch(updateSessionBlock, /patchedSession\.referentId/);
});

test("la désinscription d'un participant ne retire pas son rôle de séance", () => {
  const removeBlock = appSource.slice(
    appSource.indexOf("function removeParticipantFromSession"),
    appSource.indexOf("const updateRealisation"),
  );

  assert.match(removeBlock, /participantIds: currentSession\.participantIds\.filter/);
  assert.doesNotMatch(removeBlock, /encadrantId:/);
  assert.doesNotMatch(removeBlock, /referentId:/);
});

test("les rôles comptent dans l'effectif sans apparaître dans la liste des inscrits", () => {
  assert.match(sessionCardSource, /const sessionAttendanceIds = getSessionAttendanceIds\(normalizedSession\)/);
  assert.match(sessionCardSource, /const occupied = sessionAttendanceIds\.length/);
  assert.match(sessionCardSource, /\.filter\(\(id\) => !roleParticipantIds\.has\(String\(id\)\)\)/);
  assert.match(sessionCardSource, /!sessionAttendanceIds\.includes\(String\(participant\.id\)\)/);
});


test("seuls les encadrants et référents pilotent le type de séance dans l'interface", () => {
  assert.match(sessionCardSource, /disabled=\{!canManageSession\}/);
  assert.match(sessionCardSource, /isSessionManager\(currentParticipant\)/);
  assert.equal(isSessionManager({ canEncadrer: true }), true);
  assert.equal(isSessionManager({ canReferer: true }), true);
  assert.equal(isSessionManager({ canEncadrer: false, canReferer: false }), false);
});

test("la liste de rôle dépend strictement du type de séance", () => {
  const encadrant = { id: "e1", canEncadrer: true, canReferer: false };
  const referent = { id: "r1", canEncadrer: false, canReferer: true };

  assert.equal(isQualifiedSessionSupervisor(encadrant, "encadree"), true);
  assert.equal(isQualifiedSessionSupervisor(referent, "encadree"), false);
  assert.equal(isQualifiedSessionSupervisor(referent, "libre"), true);
  assert.equal(isQualifiedSessionSupervisor(encadrant, "libre"), false);
  assert.match(sessionCardSource, /eligibleSupervisors/);
});

test("un changement de type supprime toujours le rôle incompatible", () => {
  assert.deepEqual(
    normalizeSessionRoles({
      status: "libre",
      encadrantId: "e1",
      referentId: "r1",
    }),
    {
      status: "libre",
      encadrantId: null,
      referentId: "r1",
    },
  );

  assert.deepEqual(
    normalizeSessionRoles({
      status: "encadree",
      encadrantId: "e1",
      referentId: "r1",
    }),
    {
      status: "encadree",
      encadrantId: "e1",
      referentId: null,
    },
  );
});

test("le rôle actif vaut une présence unique pour l'effectif", () => {
  assert.deepEqual(
    getSessionAttendanceIds({
      status: "encadree",
      participantIds: ["p1", "e1"],
      encadrantId: "e1",
      referentId: "r1",
    }),
    ["p1", "e1"],
  );
  assert.deepEqual(
    getSessionAttendanceIds({
      status: "libre",
      participantIds: ["p1"],
      encadrantId: "e1",
      referentId: "r1",
    }),
    ["p1", "r1"],
  );
});


test("les statistiques de participation utilisent le même effectif que le planning", () => {
  const statisticsBlock = appSource.slice(
    appSource.indexOf("const sessionStats = useMemo"),
    appSource.indexOf("const alphabeticalParticipants"),
  );

  assert.match(statisticsBlock, /getSessionAttendanceIds\(session\)/);
});


test("la liste Inscriptions propose tous les grimpeurs éligibles et pas seulement le compte courant", () => {
  const availableBlock = sessionCardSource.slice(
    sessionCardSource.indexOf("const availableParticipants"),
    sessionCardSource.indexOf("const eligibleSupervisors"),
  );

  assert.match(availableBlock, /participants\.filter/);
  assert.doesNotMatch(availableBlock, /isAdmin \|\| String\(participant\.id\)/);
  assert.doesNotMatch(availableBlock, /String\(participant\.id\) === String\(currentParticipantId/);
});
