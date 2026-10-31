import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("le chargement Buddy ne masque plus silencieusement ses erreurs", async () => {
  const source = await readFile(new URL("../src/pages/Profil.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\.catch\(\(\) => \{\}\)/);
  assert.match(source, /Impossible de charger les disponibilités Buddy/);
  assert.match(source, /Disponibilités Buddy indisponibles/);
});
