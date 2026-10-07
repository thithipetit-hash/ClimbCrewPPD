import assert from "node:assert/strict";
import test from "node:test";

import {
  filterRouteDisplayGroups,
  formatRouteProgress,
  groupParticipantRealisationsByRoute,
  matchesRouteRealisationFilter,
} from "../src/lib/route-progress.js";

const route = { id: "r1", moulinetteOnly: false };
const realisations = [
  { id: "1", participantId: "p1", voieId: "r1", styleRealisation: "projet", modeRealisation: "en_tete", dateRealisation: "2026-10-01" },
  { id: "2", participantId: "p1", voieId: "r1", styleRealisation: "flash", modeRealisation: "moulinette", dateRealisation: "2026-10-02" },
  { id: "3", participantId: "p2", voieId: "r1", styleRealisation: "a_vue", modeRealisation: "en_tete", dateRealisation: "2026-10-03" },
];

test("les réalisations sont regroupées uniquement pour le grimpeur connecté", () => {
  const grouped = groupParticipantRealisationsByRoute(realisations, "p1");
  assert.equal(grouped.get("r1").length, 2);
  assert.equal(groupParticipantRealisationsByRoute(realisations, "p2").get("r1").length, 1);
});

test("la vue condensée indique la meilleure réalisation et son mode", () => {
  assert.equal(formatRouteProgress(realisations.slice(0, 2), route), "Réalisée · Moulinette · Flash");
  assert.equal(formatRouteProgress([realisations[0]], route), "Essayée · En tête · Projet");
  assert.equal(formatRouteProgress([], route), "Non essayée");
});

test("les filtres acceptent critères, modes et voies non essayées", () => {
  const mine = realisations.slice(0, 2);
  assert.equal(matchesRouteRealisationFilter(mine, route, "criterion:projet"), true);
  assert.equal(matchesRouteRealisationFilter(mine, route, "criterion:a_vue"), false);
  assert.equal(matchesRouteRealisationFilter(mine, route, "mode:moulinette"), true);
  assert.equal(matchesRouteRealisationFilter([], route, "none"), true);
  assert.equal(matchesRouteRealisationFilter(mine, route, "none"), false);
});

test("le filtrage conserve les groupes et ne garde que les voies correspondantes", () => {
  const grouped = groupParticipantRealisationsByRoute(realisations, "p1");
  const groups = [{ key: "g", label: "Groupe", routes: [route, { id: "r2" }] }];
  const filtered = filterRouteDisplayGroups(groups, grouped, "criterion:flash");
  assert.deepEqual(filtered[0].routes.map((item) => item.id), ["r1"]);
});