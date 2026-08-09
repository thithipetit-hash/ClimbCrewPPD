import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("les statistiques proposent quatre classements de voies", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  for (const title of ["Voies les mieux notées", "Voies les plus réalisées", "Voies les plus réalisées en tête", "Mieux notées avec au moins 3 avis"]) {
    assert.match(source, new RegExp(title));
  }
});

test("le résumé statistique ne répète plus les compteurs de réalisations", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /className="label">Réalisations<\/div><div className="value"/);
  assert.doesNotMatch(source, /className="label">Réalisations en tête<\/div><div className="value"/);
});

test("les lignes sombres des classements utilisent un texte clair", async () => {
  const styles = await readFile(new URL("../src/climbcrew-enhancements.js", import.meta.url), "utf8");
  assert.match(styles, /\.route-ranking-row > span[\s\S]*color:#f8fafc!important/);
  assert.match(styles, /\.route-ranking-row > strong[\s\S]*color:#ffffff!important/);
});

test("plusieurs caractéristiques peuvent être associées à une réalisation", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(source, /const REALISATION_TAGS =/);
  assert.match(source, /prev\.tags\.filter/);
  assert.match(source, /\.\.\.prev\.tags/);
  assert.match(source, /aria-pressed=\{selected\}/);
});
