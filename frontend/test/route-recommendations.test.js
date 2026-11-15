import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { GRADES } from "../src/lib/domain.js";
import { buildRouteRecommendations } from "../src/lib/route-recommendations.js";

const NOW = new Date("2026-11-15T12:00:00Z").getTime();

function makeRoutes() {
  return Object.fromEntries(GRADES.flatMap((grade) => ["a", "b"].map((suffix) => {
    const id = grade + "-" + suffix;
    return [id, { id, active: true, cotationAjustee: grade, numeroCorde: 2 }];
  })));
}

function success(grade, date, suffix = "a", createdAt = date + "T12:00:00Z") {
  return {
    id: grade + "-" + date + "-" + suffix,
    voieId: grade + "-" + suffix,
    dateRealisation: date,
    createdAt,
    modeRealisation: "en_tete",
    styleRealisation: "a_vue",
  };
}

test("les deux modes proposent cinq voies et un bonus distincts", () => {
  const routesById = makeRoutes();
  const realisations = [
    success("6a", "2026-11-09"),
    success("6a+", "2026-11-11"),
    success("6b", "2026-11-12"),
  ];
  const common = { routesById, realisations, currentCpr: { averageIndex: 14 }, now: NOW };
  const consolidation = buildRouteRecommendations({ ...common, mode: "consolidation" });
  const progression = buildRouteRecommendations({ ...common, mode: "progression" });

  for (const plan of [consolidation, progression]) {
    assert.equal(plan.recommendations.length, 6);
    assert.equal(plan.recommendations[5].label, "Bonus");
    assert.equal(new Set(plan.recommendations.map((item) => item.route.id)).size, 6);
    assert.equal(plan.recentCprSessions.length, 3);
  }
  const lastConsolidation = GRADES.indexOf(consolidation.recommendations[5].route.cotationAjustee);
  const lastProgression = GRADES.indexOf(progression.recommendations[5].route.cotationAjustee);
  assert.ok(lastProgression > lastConsolidation);
});

test("la référence évolue avec les CPR historiques des trois dernières séances", () => {
  const routesById = makeRoutes();
  const dates = ["2026-11-09", "2026-11-11", "2026-11-12"];
  const low = buildRouteRecommendations({
    routesById, now: NOW, realisations: dates.map((date) => success("5c", date)),
    mode: "progression",
  });
  const high = buildRouteRecommendations({
    routesById, now: NOW, realisations: dates.map((date) => success("6b", date)),
    mode: "progression",
  });
  assert.ok(low.referenceIndex < high.referenceIndex);
  assert.ok(GRADES.indexOf(low.recommendations[3].route.cotationAjustee)
    < GRADES.indexOf(high.recommendations[3].route.cotationAjustee));
});

test("le CPR courant contribue à la référence sans écarter les séances précédentes", () => {
  const plan = buildRouteRecommendations({
    routesById: makeRoutes(),
    realisations: [success("5c", "2026-11-09"), success("6a", "2026-11-11"), success("6b", "2026-11-12")],
    currentCpr: { averageIndex: 13.3 },
    now: NOW,
  });
  assert.ok(plan.referenceIndex > 12);
  assert.ok(plan.referenceIndex < 15);
  assert.equal(plan.hasCprReference, true);
});

test("une reprise après plus de 14 jours baisse davantage la consolidation que la progression", () => {
  const routesById = makeRoutes();
  const realisations = [success("6a", "2026-11-12")];
  const common = { routesById, realisations, currentCpr: { averageIndex: 13 }, now: new Date("2026-12-02T12:00:00Z").getTime() };
  const consolidation = buildRouteRecommendations({ ...common, mode: "consolidation" });
  const progression = buildRouteRecommendations({ ...common, mode: "progression" });
  assert.ok(consolidation.daysSince > 14);
  assert.ok(GRADES.indexOf(progression.recommendations[3].route.cotationAjustee)
    > GRADES.indexOf(consolidation.recommendations[3].route.cotationAjustee));
});

test("une réinitialisation personnelle exclut les anciens CPR des recommandations", () => {
  const routesById = makeRoutes();
  const realisations = [
    success("7c", "2026-11-08"),
    success("5c", "2026-11-12"),
  ];
  const result = buildRouteRecommendations({
    routesById, realisations, now: NOW,
    resetAt: "2026-11-11T12:00:00Z",
  });
  assert.equal(result.recentCprSessions.length, 1);
  assert.equal(result.recentCprSessions[0].averageIndex, GRADES.indexOf("5c"));
});

test("les cas sans CPR ou sans voies restent exploitables", () => {
  const empty = buildRouteRecommendations({ routesById: {}, realisations: [], now: NOW });
  assert.deepEqual(empty.recommendations, []);
  assert.equal(empty.hasCprReference, false);

  const available = buildRouteRecommendations({ routesById: makeRoutes(), realisations: [], now: NOW });
  assert.equal(available.recommendations.length, 6);
  assert.equal(available.hasCprReference, false);
});

test("le profil expose les deux boutons de sélection accessibles", () => {
  const source = fs.readFileSync(new URL("../src/pages/Profil.jsx", import.meta.url), "utf8");
  assert.match(source, /setRecommendationMode\("consolidation"\)/);
  assert.match(source, /setRecommendationMode\("progression"\)/);
  assert.match(source, /aria-pressed=\{recommendationMode === "progression"\}/);
});
