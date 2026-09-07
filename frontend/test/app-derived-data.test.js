import test from "node:test";
import assert from "node:assert/strict";

import { buildRouteRatings, buildSessionStats } from "../src/hooks/useAppDerivedData.js";

test("buildSessionStats agrège les inscrits et participations sans modifier les entrées", () => {
  const sessions = [
    { id: "s1", participantIds: ["p1", "p2"] },
    { id: "s2", participantIds: ["p1"] },
  ];
  const participants = [
    { id: "p2", nom: "Zulu", prenom: "Zoé", cotisation: false, ffme: true },
    { id: "p1", nom: "Alpha", prenom: "Alice", cotisation: true, ffme: false },
  ];
  const snapshot = JSON.stringify({ sessions, participants });
  const stats = buildSessionStats({
    sessions,
    participants,
    realisations: [{ id: "r1" }],
    routes: [{ id: "v1", active: true }, { id: "v2", active: false }],
  });

  assert.equal(stats.nombreInscrits, 2);
  assert.equal(stats.nombreCotisations, 1);
  assert.equal(stats.nombreFFME, 1);
  assert.equal(stats.nombreRealisations, 1);
  assert.equal(stats.nombreVoiesActives, 1);
  assert.deepEqual(stats.participationCount, { p1: 2, p2: 1 });
  assert.deepEqual(stats.sortedParticipants.map((participant) => participant.id), ["p1", "p2"]);
  assert.equal(JSON.stringify({ sessions, participants }), snapshot);
});

test("buildRouteRatings ignore les notes invalides et calcule la moyenne", () => {
  const ratings = buildRouteRatings([
    { voieId: "v1", rating: 5 },
    { voieId: "v1", rating: "3" },
    { voieId: "v1", rating: 0 },
    { voieId: "v2", rating: 4.5 },
  ]);

  assert.deepEqual(ratings.v1, { total: 8, count: 2, average: 4 });
  assert.equal(ratings.v2, undefined);
});
