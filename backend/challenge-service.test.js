import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateChallengeRanking,
  challengeBadgeDistinction,
  findSelectedRoutes,
  normalizeChallengeRouteIds,
} from "./challenge-service.js";

test("normalizeChallengeRouteIds accepte plusieurs voies et supprime les doublons", () => {
  assert.deepEqual(normalizeChallengeRouteIds([" route-1 ", "route-2", "route-1", ""]), ["route-1", "route-2"]);
});

test("normalizeChallengeRouteIds refuse un challenge sans voie", () => {
  assert.throws(() => normalizeChallengeRouteIds([]), /au moins une voie/i);
  assert.throws(() => normalizeChallengeRouteIds(null), /une ou plusieurs voies/i);
});

test("findSelectedRoutes charge uniquement les voies explicitement sélectionnées", async () => {
  const db = {
    async query(sql, values) {
      assert.match(sql, /id::text = any/);
      assert.deepEqual(values, [["route-1", "route-2"]]);
      return { rows: [
        { id: "route-1", numeroCorde: 1, numeroVoieUnique: 10 },
        { id: "route-2", numeroCorde: 2, numeroVoieUnique: 20 },
      ] };
    },
  };
  const routes = await findSelectedRoutes(db, ["route-1", "route-2"]);
  assert.deepEqual(routes.map((route) => route.id), ["route-1", "route-2"]);
});

test("findSelectedRoutes refuse une voie supprimée entre la sélection et la création", async () => {
  const db = {
    async query() {
      return { rows: [{ id: "route-1" }] };
    },
  };
  await assert.rejects(() => findSelectedRoutes(db, ["route-1", "route-2"]), /n.existent plus/i);
});

test("challengeBadgeDistinction différencie podium et participation", () => {
  assert.equal(challengeBadgeDistinction(1), "or");
  assert.equal(challengeBadgeDistinction(2), "argent");
  assert.equal(challengeBadgeDistinction(3), "bronze");
  assert.equal(challengeBadgeDistinction(4), "participation");
});

test("calculateChallengeRanking compte toute voie essayée une seule fois et départage par date", async () => {
  const calls = [];
  const db = {
    async query(sql, values) {
      calls.push({ sql, values });
      return { rows: [
        { id: "a1", participantId: "1", voieId: "r1", dateRealisation: "2026-10-02", styleRealisation: "a_vue", modeRealisation: "en_tete", prenom: "Alice", nom: "Alpha" },
        { id: "a2", participantId: "1", voieId: "r1", dateRealisation: "2026-10-03", styleRealisation: "flash", modeRealisation: "en_tete", prenom: "Alice", nom: "Alpha" },
        { id: "a3", participantId: "1", voieId: "r2", dateRealisation: "2026-10-04", styleRealisation: "travaillee", modeRealisation: "moulinette", prenom: "Alice", nom: "Alpha" },
        { id: "b1", participantId: "2", voieId: "r1", dateRealisation: "2026-10-02", styleRealisation: "a_vue", modeRealisation: "en_tete", prenom: "Bob", nom: "Beta" },
        { id: "b2", participantId: "2", voieId: "r2", dateRealisation: "2026-10-03", styleRealisation: "flash", modeRealisation: "en_tete", prenom: "Bob", nom: "Beta" },
        { id: "c1", participantId: "3", voieId: "r1", dateRealisation: "2026-10-02", styleRealisation: "projet", modeRealisation: "en_tete", prenom: "Chloé", nom: "Gamma" },
      ] };
    },
  };
  const ranking = await calculateChallengeRanking(db, { startsOn: "2026-10-01", endsOn: "2026-10-31" }, [{ id: "r1" }, { id: "r2" }]);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].values, [["r1", "r2"], "2026-10-01", "2026-10-31"]);
  assert.deepEqual(ranking.map(({ participantId, score, rank, finalScoringAt }) => ({ participantId, score, rank, finalScoringAt })), [
    { participantId: "2", score: 2, rank: 1, finalScoringAt: "2026-10-03" },
    { participantId: "1", score: 2, rank: 2, finalScoringAt: "2026-10-04" },
    { participantId: "3", score: 1, rank: 3, finalScoringAt: "2026-10-02" },
  ]);
  assert.deepEqual(ranking[1].completedRouteIds.sort(), ["r1", "r2"]);
  assert.deepEqual(ranking[2].completedRouteIds, ["r1"]);
});

test("calculateChallengeRanking transmet la date de début qui exclut l'historique", async () => {
  const db = { async query(_sql, values) { assert.equal(values[1], "2026-10-05"); assert.equal(values[2], null); return { rows: [] }; } };
  const ranking = await calculateChallengeRanking(db, { startsOn: "2026-10-05", endsOn: null }, [{ id: "r1" }]);
  assert.deepEqual(ranking, []);
});