import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const component = await readFile(new URL("../src/components/RealisationVideoAnalysis.jsx", import.meta.url), "utf8");

test("les mesures d'une réalisation sont chargées à la demande", () => {
  assert.match(component, /\/realisations\/\$\{encodeURIComponent\(realisation\.id\)\}\/technical-analysis/);
  assert.match(component, /setTechnicalAnalysis\(result\?\.technicalAnalysis/);
  assert.match(component, /Chargement des mesures enregistrées/);
});

test("une nouvelle analyse met à jour le cache local sans recharger toutes les réalisations", () => {
  assert.match(component, /onSaved=\{\(nextTechnicalAnalysis\)/);
  assert.match(component, /setTechnicalAnalysis\(nextTechnicalAnalysis \|\| null\)/);
});
