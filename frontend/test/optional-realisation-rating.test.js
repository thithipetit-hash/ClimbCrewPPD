import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("l'évaluation d'une réalisation est facultative et la modale est extraite", async () => {
  const [appSource, modalSource] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/RealisationModal.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(appSource, /if \(!newRealisation\.participantId \|\| !newRealisation\.selectedDay \|\| !newRealisation\.voieId\) \{/);
  assert.doesNotMatch(appSource, /!newRealisation\.voieId \|\| !newRealisation\.rating/);
  assert.match(appSource, /\.\.\.\(newRealisation\.rating \? \{ rating: newRealisation\.rating \} : \{\}\)/);
  assert.match(appSource, /<RealisationModal/);
  assert.match(modalSource, /Évaluation de la voie \(facultative\)/);
  assert.doesNotMatch(modalSource, /Cotation consensus/);
  assert.doesNotMatch(modalSource, /!newRealisation\.rating/);
});
