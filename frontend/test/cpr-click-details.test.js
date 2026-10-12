import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { GRADES, calculateCprHistory } from "../src/lib/domain.js";

const chartSource = fs.readFileSync(
  new URL("../src/sections/CprEvolutionChart.jsx", import.meta.url),
  "utf8",
);
const profileSource = fs.readFileSync(
  new URL("../src/pages/Profil.jsx", import.meta.url),
  "utf8",
);

test("un clic sur un point CPR affiche les réalisations réellement retenues dans le calcul", () => {
  const dateRealisation = new Date().toISOString().slice(0, 10);
  const grades = GRADES.slice(-11);
  const routesById = Object.fromEntries(grades.map((grade, index) => [
    `v${index}`,
    { id: `v${index}`, active: true, cotationAjustee: grade, numeroCorde: index + 1 },
  ]));
  const realisations = Object.values(routesById).map((route, index) => ({
    id: `r${index}`,
    participantId: "p1",
    voieId: route.id,
    dateRealisation,
    modeRealisation: "en_tete",
    styleRealisation: "a_vue",
  }));

  const point = calculateCprHistory(realisations, routesById).at(-1);

  assert.equal(point.realisationIds.length, 11);
  assert.equal(point.includedIds.length, 10);
  assert.equal(point.includedIds.includes("r0"), false);
  assert.match(chartSource, /selectedPoint\.includedIds\.includes\(String\(item\.id\)\)/);
});

test("le CPR actuel ouvre la liste des voies prises en compte", () => {
  assert.match(profileSource, /import CprDetailsModal from "\.\.\/components\/CprDetailsModal\.jsx"/);
  assert.match(profileSource, /className="cpr-stat-button"/);
  assert.match(profileSource, /setCprDetailsOpen\(true\)/);
  assert.match(profileSource, /<CprDetailsModal/);
});
