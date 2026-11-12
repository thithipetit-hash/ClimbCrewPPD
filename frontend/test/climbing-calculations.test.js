import test from "node:test";
import assert from "node:assert/strict";

// climbing-calculations.js et route-utils.js ont été fusionnés dans lib/domain.js
// lors de la restructuration du frontend (src/lib, src/pages, src/sections...).
import {
  GRADES,
  calculateLeadPoints,
  calculateLeadRealisationStats,
  calculateCprHistory,
  calculateRouteAggregates,
  calculateSimpleCpr,
  calculateWallOfFameCategories,
  isSuccessfulLeadRealisation,
  weightedMedian,
} from "../src/lib/domain.js";
import {
  getRealisationMode,
  getRealisationWeight,
} from "../src/lib/realisation-mode.js";

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
      modeRealisation: "en_tete",
      styleRealisation: "travaillee",
    },
    {
      id: "r2",
      voieId: "v2",
      dateRealisation: "2025-01-01",
      modeRealisation: "en_tete",
      styleRealisation: "travaillee",
    },
  ];

  const cpr = calculateSimpleCpr(realisations, routesById, now);
  assert.equal(cpr.timeline.length, 1);
  assert.equal(cpr.timeline[0].id, "r1");
});

test("une seule 6a réussie à vue donne un CPR 6a et les essais sont exclus", () => {
  const now = new Date("2026-09-20T12:00:00Z").getTime();
  const routesById = {
    v1: { id: "v1", cotationAjustee: "6a" },
    v2: { id: "v2", cotationAjustee: "7a" },
  };
  const realisations = [
    { id: "r1", voieId: "v1", dateRealisation: "2026-09-19", modeRealisation: "en_tete", styleRealisation: "a_vue" },
    { id: "r2", voieId: "v2", dateRealisation: "2026-09-19", modeRealisation: "en_tete", styleRealisation: "projet" },
  ];

  const cpr = calculateSimpleCpr(realisations, routesById, now);
  assert.equal(cpr.currentGrade, "6a");
  assert.equal(cpr.timeline.length, 1);
  assert.equal(cpr.timeline[0].id, "r1");
});

test("l'historique CPR restitue le niveau après chaque journée de réalisation", () => {
  const routesById = { v1: { id: "v1", cotationAjustee: "6a" }, v2: { id: "v2", cotationAjustee: "6b" } };
  const realisations = [
    { id: "r1", voieId: "v1", dateRealisation: "2026-06-01", modeRealisation: "en_tete", styleRealisation: "travaillee" },
    { id: "r2", voieId: "v2", dateRealisation: "2026-07-01", modeRealisation: "en_tete", styleRealisation: "travaillee" },
  ];
  const history = calculateCprHistory(realisations, routesById, new Date("2026-08-01").getTime());
  assert.deepEqual(history.map((point) => point.date), ["2026-06-01", "2026-07-01"]);
  assert.deepEqual(history[1].includedIds.sort(), ["r1", "r2"]);
});

test("le mode est indépendant du critère de réalisation", () => {
  assert.equal(getRealisationMode({ modeRealisation: "en_tete", styleRealisation: "a_vue" }), "en_tete");
  assert.equal(getRealisationMode({ modeRealisation: "moulinette", styleRealisation: "a_vue" }), "moulinette");
  assert.equal(getRealisationWeight({ modeRealisation: "en_tete", styleRealisation: "a_vue" }), 1.25);
  assert.equal(getRealisationWeight({ modeRealisation: "moulinette", styleRealisation: "a_vue" }), 0.85);
});

test("les statistiques en tête n'affichent que les cotations ayant au moins une voie", () => {
  const routes = [
    { id: "v1", cotationAjustee: "6a" },
    { id: "v2", cotationAjustee: "5c" },
  ];
  const routesById = Object.fromEntries(routes.map((route) => [route.id, route]));
  const realisations = [
    { id: "r1", voieId: "v1", modeRealisation: "en_tete", styleRealisation: "a_vue" },
  ];

  const stats = calculateLeadRealisationStats(routes, realisations, routesById);
  assert.equal(stats.total, 1);
  assert.deepEqual(stats.byGrade.map((entry) => entry.grade), ["5c", "6a"]);
  assert.equal(stats.byGrade.find((entry) => entry.grade === "6a").ratio, 1);
  assert.equal(stats.byGrade.find((entry) => entry.grade === "5c").ratio, 0);
  assert.equal(stats.byGrade.some((entry) => entry.grade === "4a"), false);
});

test("À vue, Flash et Travaillée sont des réussites en tête uniquement avec le mode En tête", () => {
  const route = { id: "v1" };
  ["a_vue", "flash", "travaillee"].forEach((styleRealisation) => {
    assert.equal(
      isSuccessfulLeadRealisation({ modeRealisation: "en_tete", styleRealisation }, route),
      true,
    );
    assert.equal(
      isSuccessfulLeadRealisation({ modeRealisation: "moulinette", styleRealisation }, route),
      false,
    );
  });
  ["avec_repos", "projet", "non_enchainee", "test"].forEach((styleRealisation) => {
    assert.equal(
      isSuccessfulLeadRealisation({ modeRealisation: "en_tete", styleRealisation }, route),
      false,
    );
  });
  assert.equal(
    isSuccessfulLeadRealisation(
      { modeRealisation: "en_tete", styleRealisation: "a_vue" },
      { id: "v2", moulinetteOnly: true },
    ),
    false,
  );
});

test("les anciennes valeurs En tête et Moulinette restent compatibles", () => {
  assert.equal(isSuccessfulLeadRealisation({ styleRealisation: "en_tete" }, { id: "v1" }), true);
  assert.equal(isSuccessfulLeadRealisation({ styleRealisation: "moulinette" }, { id: "v1" }), false);
  assert.equal(getRealisationMode({ styleRealisation: "moulinette" }), "moulinette");
});

test("chaque voie distribue exactement 1 000 points entre ses réussites en tête distinctes", () => {
  const participants = [{ id: "p1" }, { id: "p2" }];
  const routes = [
    { id: "v1" },
    { id: "v2" },
    { id: "v3", moulinetteOnly: true },
  ];
  const realisations = [
    { participantId: "p1", voieId: "v1", modeRealisation: "en_tete", styleRealisation: "a_vue" },
    { participantId: "p1", voieId: "v1", modeRealisation: "en_tete", styleRealisation: "a_vue" },
    { participantId: "p2", voieId: "v1", modeRealisation: "en_tete", styleRealisation: "flash" },
    { participantId: "p1", voieId: "v2", modeRealisation: "en_tete", styleRealisation: "travaillee" },
    { participantId: "p2", voieId: "v3", modeRealisation: "en_tete", styleRealisation: "a_vue" },
    { participantId: "p2", voieId: "v2", modeRealisation: "moulinette", styleRealisation: "a_vue" },
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
      modeRealisation: "en_tete",
      styleRealisation: "travaillee",
    },
    {
      participantId: "p2",
      voieId: "v1",
      cotationProposee: "6a",
      modeRealisation: "en_tete",
      styleRealisation: "travaillee",
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
    participationCount: { p1: 1, p2: 1 },
  });

  const pointsRanking = categories.find((category) => category.title === "Plus de points");
  assert.deepEqual(pointsRanking.entries.map((entry) => entry.rank), [1, 1]);
});

test("le Wall of Fame distingue une réussite en tête d'une réussite en moulinette", () => {
  const participants = [
    { id: "p1", nom: "A", prenom: "Alice" },
    { id: "p2", nom: "B", prenom: "Bob" },
  ];
  const routesById = {
    v1: { id: "v1" },
    v2: { id: "v2" },
  };
  const realisations = [
    { participantId: "p1", voieId: "v1", modeRealisation: "en_tete", styleRealisation: "a_vue" },
    { participantId: "p1", voieId: "v2", modeRealisation: "en_tete", styleRealisation: "travaillee" },
    { participantId: "p2", voieId: "v1", modeRealisation: "moulinette", styleRealisation: "flash" },
  ];

  const categories = calculateWallOfFameCategories({
    participants,
    realisations,
    routesById,
    cprByParticipantId: {},
    pointsByParticipantId: { p1: 0, p2: 0 },
    participationCount: { p1: 1, p2: 1 },
  });
  const ranking = categories.find((category) => category.title === "Voies réalisées en tête");
  const valuesById = Object.fromEntries(ranking.entries.map((entry) => [entry.participant.id, entry.value]));
  assert.equal(valuesById.p1, 2);
  assert.equal(valuesById.p2, 0);
});

test("le Tableau d’honneur classe tous les inscrits au moins une fois et exclut les autres", () => {
  const participants = [
    { id: "p1", nom: "A", prenom: "Alice" },
    { id: "p2", nom: "B", prenom: "Bob" },
    { id: "p3", nom: "C", prenom: "Chloé" },
    { id: "p4", nom: "D", prenom: "David" },
    { id: "p5", nom: "E", prenom: "Emma" },
  ];

  const categories = calculateWallOfFameCategories({
    participants,
    realisations: [],
    routesById: {},
    cprByParticipantId: {},
    pointsByParticipantId: {},
    participationCount: { p1: 5, p2: 4, p3: 3, p4: 1, p5: 0 },
  });

  const participationsRanking = categories.find((category) => category.title === "Plus de participations");
  assert.deepEqual(
    participationsRanking.entries.map((entry) => entry.participant.id),
    ["p1", "p2", "p3", "p4"],
  );

  const pointsRanking = categories.find((category) => category.title === "Plus de points");
  assert.equal(pointsRanking.entries.length, 4);
  assert.equal(pointsRanking.entries.some((entry) => entry.participant.id === "p5"), false);
  assert.deepEqual(pointsRanking.entries.map((entry) => entry.rank), [1, 1, 1, 1]);
  assert.deepEqual(pointsRanking.entries.map((entry) => entry.displayValue), ["0 points", "0 points", "0 points", "0 points"]);
});


test("le reset du CPR exclut l'historique, même enregistré le jour du reset", () => {
  const resetAt = "2026-10-29T12:00:00.000Z";
  const now = new Date("2026-10-30T12:00:00Z").getTime();
  const routesById = { v1: { cotationAjustee: "7c" }, v2: { cotationAjustee: "5c" } };
  const realisations = [
    { id: "avant", voieId: "v1", dateRealisation: "2026-10-29", createdAt: "2026-10-29T11:59:59Z", styleRealisation: "a_vue" },
    { id: "apres", voieId: "v2", dateRealisation: "2026-10-29", createdAt: "2026-10-29T12:00:01Z", styleRealisation: "flash" },
    { id: "importe", voieId: "v1", dateRealisation: "2026-10-28", createdAt: "2026-10-30T08:00:00Z", styleRealisation: "a_vue" },
  ];
  const cpr = calculateSimpleCpr(realisations, routesById, now, resetAt);
  assert.equal(cpr.currentGrade, "5c");
  assert.deepEqual(cpr.timeline.map((point) => point.id), ["apres"]);
  const history = calculateCprHistory(realisations, routesById, now, resetAt);
  assert.deepEqual(history.map((point) => point.date), ["2026-10-29"]);
  assert.deepEqual(history[0].includedIds, ["apres"]);
  assert.equal(calculateSimpleCpr(realisations, routesById, now).timeline.length, 3);
});

test("après reset, le CPR est non calculé tant qu'aucune nouvelle réalisation n'existe", () => {
  const now = new Date("2026-10-29T16:00:00Z").getTime();
  const realisations = [
    { id: "ancien", voieId: "v1", dateRealisation: "2026-10-29", createdAt: "2026-10-29T15:00:00Z", styleRealisation: "a_vue" },
  ];
  const cpr = calculateSimpleCpr(realisations, { v1: { cotationAjustee: "6b" } }, now, "2026-10-29T15:30:00Z");
  assert.equal(cpr.currentGrade, null);
  assert.deepEqual(cpr.timeline, []);
});
