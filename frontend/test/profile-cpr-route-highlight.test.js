import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { GRADES } from "../src/lib/domain.js";
import { buildRouteRealisationStatistics } from "../src/lib/route-realisation-statistics.js";

const tableSource = fs.readFileSync(
  new URL("../src/components/RouteRealisationStatisticsTable.jsx", import.meta.url),
  "utf8",
);

test("les statistiques de voies marquent uniquement les réalisations retenues dans le CPR", () => {
  const dateRealisation = new Date().toISOString().slice(0, 10);
  const grades = GRADES.slice(-11);
  const routes = grades.map((grade, index) => ({
    id: `v${index}`,
    active: true,
    cotationAjustee: grade,
    numeroCorde: index + 1,
  }));
  const realisations = routes.map((route, index) => ({
    id: `r${index}`,
    participantId: "p1",
    voieId: route.id,
    dateRealisation,
    modeRealisation: "en_tete",
    styleRealisation: "a_vue",
  }));

  const rows = buildRouteRealisationStatistics(routes, realisations);
  const includedRoutes = rows.filter((row) => row.cprIncluded).map((row) => row.route.id);

  assert.equal(includedRoutes.length, 10);
  assert.equal(includedRoutes.includes("v0"), false);
  assert.equal(includedRoutes.includes("v10"), true);
});

test("le tableau Voies du grimpeur affiche en vert les voies CPR", () => {
  assert.match(tableSource, /title === "Voies du grimpeur"/);
  assert.match(tableSource, /entry\.cprIncluded/);
  assert.match(tableSource, /data-cpr-included=\{cprIncluded \? "true" : undefined\}/);
  assert.match(tableSource, /rgba\(34, 197, 94, 0\.24\)/);
  assert.match(tableSource, /Voie prise en compte pour le CPR/);
});
