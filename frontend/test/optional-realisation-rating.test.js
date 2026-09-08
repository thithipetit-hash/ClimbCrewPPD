import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("l'évaluation d'une réalisation reste facultative après extraction du payload", async () => {
  const [appSource, modalSource, workflowSource] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/RealisationModal.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/realisation-workflow.js", import.meta.url), "utf8"),
  ]);
  assert.match(appSource, /if \(!newRealisation\.participantId \|\| !newRealisation\.selectedDay \|\| !newRealisation\.voieId\) \{/);
  assert.doesNotMatch(appSource, /!newRealisation\.voieId \|\| !newRealisation\.rating/);
  assert.match(appSource, /buildRealisationPayload\(\{/);
  assert.match(workflowSource, /rating >= 1 && rating <= 5 \? \{ rating \} : \{\}/);
  assert.match(appSource, /<RealisationModal/);
  assert.match(modalSource, /Évaluation de la voie \(facultative\)/);
  assert.doesNotMatch(modalSource, /Cotation consensus/);
  assert.doesNotMatch(modalSource, /!newRealisation\.rating/);
});
