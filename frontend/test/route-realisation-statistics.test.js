import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRouteRealisationStatistics,
  filterAndSortRouteRealisationStatistics,
  filterRouteRealisationStatistics,
} from "../src/lib/route-realisation-statistics.js";

test("compte les réalisations d'une voie par mode et critère", () => {
  const rows = buildRouteRealisationStatistics(
    [
      { id: "r1", active: true },
      { id: "r2", active: true, moulinetteOnly: true },
      { id: "r3", active: false },
    ],
    [
      { voieId: "r1", modeRealisation: "en_tete", styleRealisation: "a_vue" },
      { voieId: "r1", modeRealisation: "en_tete", styleRealisation: "travaillee" },
      { voieId: "r1", modeRealisation: "moulinette", styleRealisation: "flash" },
      { voieId: "r1", styleRealisation: "en_tete" },
      { voieId: "r2", modeRealisation: "en_tete", styleRealisation: "projet" },
      { voieId: "r3", modeRealisation: "en_tete", styleRealisation: "a_vue" },
    ],
  );

  assert.equal(rows.length, 2);
  const first = rows.find((row) => row.route.id === "r1");
  assert.equal(first.total, 4);
  assert.deepEqual(first.modeCounts, { en_tete: 3, moulinette: 1 });
  assert.equal(first.criterionCounts.a_vue, 1);
  assert.equal(first.criterionCounts.flash, 1);
  assert.equal(first.criterionCounts.travaillee, 1);
  assert.equal(first.historicalCriterionCount, 1);
  assert.equal(first.combinationCounts.en_tete.a_vue, 1);
  assert.equal(first.combinationCounts.moulinette.flash, 1);

  const moulinetteOnly = rows.find((row) => row.route.id === "r2");
  assert.equal(moulinetteOnly.modeCounts.moulinette, 1);
  assert.equal(moulinetteOnly.combinationCounts.moulinette.projet, 1);
});

test("filtre sur le mode, le critère et leur combinaison", () => {
  const rows = buildRouteRealisationStatistics(
    [{ id: "r1" }, { id: "r2" }],
    [
      { voieId: "r1", modeRealisation: "en_tete", styleRealisation: "a_vue" },
      { voieId: "r1", modeRealisation: "moulinette", styleRealisation: "flash" },
      { voieId: "r2", modeRealisation: "moulinette", styleRealisation: "a_vue" },
    ],
  );

  assert.deepEqual(
    filterRouteRealisationStatistics(rows, { mode: "en_tete", criterion: "all" }).map((row) => row.route.id),
    ["r1"],
  );
  assert.deepEqual(
    filterRouteRealisationStatistics(rows, { mode: "all", criterion: "a_vue" }).map((row) => row.route.id),
    ["r1", "r2"],
  );
  assert.deepEqual(
    filterRouteRealisationStatistics(rows, { mode: "en_tete", criterion: "a_vue" }).map((row) => row.route.id),
    ["r1"],
  );
  assert.deepEqual(
    filterRouteRealisationStatistics(rows, { mode: "en_tete", criterion: "flash" }).map((row) => row.route.id),
    [],
  );
});


test("filtre et trie chaque colonne du tableau des réalisations par voie", () => {
  const rows = buildRouteRealisationStatistics(
    [
      { id: "r1", numeroCorde: 2, nomVoie: "Alpha", cotationAjustee: "6a" },
      { id: "r2", numeroCorde: 1, nomVoie: "Beta", cotationAjustee: "6c" },
      { id: "r3", numeroCorde: 3, nomVoie: "Gamma", cotationAjustee: "5c" },
    ],
    [
      { voieId: "r1", modeRealisation: "en_tete", styleRealisation: "a_vue" },
      { voieId: "r1", modeRealisation: "en_tete", styleRealisation: "flash" },
      { voieId: "r2", modeRealisation: "moulinette", styleRealisation: "travaillee" },
    ],
  );
  const formatRouteName = (route) => route.nomVoie;

  assert.deepEqual(
    filterAndSortRouteRealisationStatistics(rows, {
      filters: { lead: ">=1" },
      sortKey: "grade",
      sortDirection: "desc",
      formatRouteName,
    }).map((row) => row.route.id),
    ["r1"],
  );

  assert.deepEqual(
    filterAndSortRouteRealisationStatistics(rows, {
      filters: { route: "a" },
      sortKey: "rope",
      sortDirection: "asc",
      formatRouteName,
    }).map((row) => row.route.id),
    ["r2", "r1", "r3"],
  );

  assert.deepEqual(
    filterAndSortRouteRealisationStatistics(rows, {
      filters: { total: "0" },
      sortKey: "route",
      sortDirection: "asc",
      formatRouteName,
    }).map((row) => row.route.id),
    ["r3"],
  );
});
