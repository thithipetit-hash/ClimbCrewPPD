import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("les statistiques proposent quatre classements de voies", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  for (const title of ["Voies les mieux notées", "Voies les plus réalisées", "Voies les plus réalisées en tête", "Mieux notées avec au moins 3 avis"]) {
    assert.match(source, new RegExp(title));
  }
});

test("plusieurs caractéristiques peuvent être associées à une réalisation", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(source, /const REALISATION_TAGS =/);
  assert.match(source, /prev\.tags\.filter/);
  assert.match(source, /\.\.\.prev\.tags/);
  assert.match(source, /aria-pressed=\{selected\}/);
});
