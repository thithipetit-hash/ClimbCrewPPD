import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  getSessionAttendanceIds,
  isQualifiedSessionSupervisor,
  isSessionManager,
  normalizeSessionRoles,
} from "../../shared/session-rules.js";
import {
  getPassportDotLabel,
  getPassportDotStyle,
  isLibreEligiblePassport,
  PASSPORT_OPTIONS,
} from "../src/lib/domain.js";

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

test("un rôle n'est compté que lorsqu'il est inscrit explicitement", () => {
  assert.match(sessionCardSource, /const inscrits = sessionParticipantIds/);
  assert.match(sessionCardSource, /const occupied = sessionParticipantIds\.length/);
  assert.match(sessionCardSource, /!sessionParticipantIds\.includes\(participantId\)/);
  assert.match(sessionCardSource, /occupied < MAX_PARTICIPANTS/);
  assert.doesNotMatch(sessionCardSource, /roleParticipantIds/);
});


test("seuls les encadrants et référents pilotent le type de séance dans l'interface", () => {
  assert.match(sessionCardSource, /disabled=\{!canManageSession\}/);
  assert.match(sessionCardSource, /isSessionManager\(currentParticipant\)/);
  assert.equal(isSessionManager({ canEncadrer: true }), true);
  assert.equal(isSessionManager({ canReferer: true }), true);
  assert.equal(isSessionManager({ canEncadrer: false, canReferer: false }), false);
  assert.equal(isSessionManager(null), false);
  assert.equal(isSessionManager(undefined), false);
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


test("les statistiques de participation utilisent uniquement les inscriptions explicites", () => {
  const statisticsBlock = appSource.slice(
    appSource.indexOf("const sessionStats = useMemo"),
    appSource.indexOf("const alphabeticalParticipants"),
  );

  assert.match(statisticsBlock, /getSessionParticipantIds\(session\)/);
  assert.doesNotMatch(statisticsBlock, /getSessionAttendanceIds\(session\)/);
});


test("tous les utilisateurs disposent de l'action de désinscription", () => {
  assert.doesNotMatch(
    sessionCardSource,
    /\{\(isAdmin \|\| String\(participant\.id\)/,
  );
  assert.match(
    sessionCardSource,
    /onRemoveParticipant\(session\.id, participant\.id\)/,
  );
});

test("Découverte ajoute un D noir et conserve une pastille pleine", () => {
  const values = PASSPORT_OPTIONS.map(({ value }) => value);
  assert.deepEqual(values, ["sans", "jaune", "orange", "bleu", "vert"]);

  for (const color of values) {
    const regular = { passport: color, passportDecouverte: false, ffme: false };
    const discovery = { passport: color, passportDecouverte: true, ffme: false };
    const licensed = { passport: color, passportDecouverte: false, ffme: true };

    assert.equal(getPassportDotLabel(regular), "");
    assert.equal(getPassportDotLabel(discovery), "D");
    assert.equal(
      getPassportDotStyle(discovery).backgroundColor,
      getPassportDotStyle(licensed).backgroundColor,
    );
    assert.equal(getPassportDotStyle(discovery).backgroundImage, "none");
    assert.equal(getPassportDotStyle(discovery).color, "#000000");
  }

  const licensed = getPassportDotStyle({ passport: "sans", ffme: true });
  assert.equal(licensed.backgroundColor, "#cbd5e1");
  assert.equal(licensed.backgroundImage, "none");

  const unlicensed = getPassportDotStyle({ passport: "sans", ffme: false });
  assert.equal(unlicensed.backgroundColor, "transparent");
  assert.match(unlicensed.backgroundImage, /linear-gradient\(to right, #cbd5e1 0 50%, transparent 50% 100%\)/);

  const discoveryUnlicensed = getPassportDotStyle({ passport: "sans", passportDecouverte: true, ffme: false });
  assert.equal(discoveryUnlicensed.backgroundColor, "#cbd5e1");
  assert.equal(discoveryUnlicensed.backgroundImage, "none");

  assert.equal(isLibreEligiblePassport("sans"), false);
  for (const color of ["jaune", "orange", "bleu", "vert"]) {
    assert.equal(isLibreEligiblePassport(color), true);
  }

  // Compatibilité avec les valeurs existantes jusqu'à leur migration.
  assert.equal(getPassportDotLabel({ passport: "jaune_d" }), "D");
  assert.equal(getPassportDotStyle({ passport: "jaune_d", ffme: false }).backgroundColor, "#fde047");
  assert.equal(getPassportDotStyle({ passport: "jaune_d", ffme: false }).backgroundImage, "none");
  assert.equal(getPassportDotLabel({ passport: "decouverte" }), "D");
  assert.equal(getPassportDotStyle({ passport: "decouverte", ffme: false }).backgroundColor, "#cbd5e1");
  assert.equal(getPassportDotStyle({ passport: "decouverte", ffme: false }).backgroundImage, "none");
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