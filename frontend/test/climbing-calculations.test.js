import test from "node:test";
import assert from "node:assert/strict";

import {
  GRADES,
  calculateLeadPoints,
  calculateLeadRealisationStats,
  calculateRouteAggregates,
  calculateSimpleCpr,
  calculateWallOfFameCategories,
  weightedMedian,
} from "../src/climbing-calculations.js";

test("le CPR conserve les dix meilleures réalisations des 90 derniers jours", () => {
  const now = new Date("2026-08-09T12:00:00Z").getTime();
  const routesById = {
    v1: { id: "v1", cotationAjustee: "6a" },
    v2: { id: "v2", cotationAjustee: "6b" },
  };
  const realisations = [
    {
      id: "r1",
      voieId: "v1",
      dateRealisation: "2026-08-01",
      styleRealisation: "en_tete",
    },
    {
      id: "r2",
      voieId: "v2",
      dateRealisation: "2025-01-01",
      styleRealisation: "en_tete",
    },
  ];

  const cpr = calculateSimpleCpr(realisations, routesById, now);
  assert.equal(cpr.currentGrade, "6a");
  assert.equal(cpr.timeline.length, 1);
  assert.equal(cpr.timeline[0].id, "r1");
});

test("les statistiques en tête contiennent toujours les quinze cotations", () => {
  const routes = [{ id: "v1", cotationAjustee: "6a" }];
  const routesById = { v1: routes[0] };
  const realisations = [
    { id: "r1", voieId: "v1", styleRealisation: "en_tete" },
  ];

  const stats = calculateLeadRealisationStats(routes, realisations, routesById);
  assert.equal(stats.byGrade.length, GRADES.length);
  assert.equal(stats.byGrade.find((entry) => entry.grade === "6a").ratio, 1);
  assert.equal(stats.byGrade.find((entry) => entry.grade === "4a").ratio, null);
});

test("chaque voie distribue exactement 1 000 points entre ses grimpeurs en tête", () => {
  const participants = [{ id: "p1" }, { id: "p2" }];
  const routes = [{ id: "v1" }, { id: "v2" }];
  const realisations = [
    { participantId: "p1", voieId: "v1", styleRealisation: "en_tete" },
    { participantId: "p1", voieId: "v1", styleRealisation: "en_tete" },
    { participantId: "p2", voieId: "v1", styleRealisation: "en_tete" },
    { participantId: "p1", voieId: "v2", styleRealisation: "en_tete" },
  ];

  const points = calculateLeadPoints(participants, routes, realisations);
  assert.equal(points.p1, 1500);
  assert.equal(points.p2, 500);
});

test("le consensus pondère davantage l'avis d'un grimpeur avec CPR", () => {
  const routes = [{ id: "v1" }];
  const realisations = [
    {
      participantId: "p1",
      voieId: "v1",
      cotationProposee: "5a",
      styleRealisation: "en_tete",
    },
    {
      participantId: "p2",
      voieId: "v1",
      cotationProposee: "6a",
      styleRealisation: "en_tete",
    },
  ];
  const cpr = {
    p1: { averageIndex: 0 },
    p2: { averageIndex: GRADES.length - 1 },
  };

  const aggregates = calculateRouteAggregates(routes, realisations, cpr);
  assert.equal(aggregates.v1.count, 2);
  assert.equal(aggregates.v1.consensusGrade, "5c");
});

test("la médiane pondérée suit l'ordre des cotations", () => {
  assert.equal(weightedMedian([
    { grade: "5a", weight: 1 },
    { grade: "6a", weight: 3 },
    { grade: "6b", weight: 1 },
  ]), "6a");
});

test("le Wall of Fame conserve le même rang en cas d'égalité", () => {
  const participants = [
    { id: "p1", nom: "A", prenom: "Alice" },
    { id: "p2", nom: "B", prenom: "Bob" },
  ];
  const categories = calculateWallOfFameCategories({
    participants,
    realisations: [],
    routesById: {},
    cprByParticipantId: {},
    pointsByParticipantId: { p1: 100, p2: 100 },
    participationCount: {},
  });

  const pointsRanking = categories.find((category) => category.title === "Plus de points");
  assert.deepEqual(pointsRanking.entries.map((entry) => entry.rank), [1, 1]);
});
