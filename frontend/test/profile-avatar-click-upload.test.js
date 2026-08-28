import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Mon profil ouvre les choix avatar image et sexe en cliquant sur l'avatar", async () => {
  const source = await readFile(new URL("../src/components/ProfileGecko.jsx", import.meta.url), "utf8");

  assert.match(source, /function handleAvatarImageClick\(\)/);
  assert.match(source, /setShowAvatarEditor\(\(visible\) => !visible\)/);
  assert.match(source, /onClick=\{handleAvatarImageClick\}/);
  assert.match(source, /Personnaliser mon profil/);
  assert.match(source, /<span>Avatar<\/span>/);
  assert.match(source, /<span>Sexe<\/span>/);
  assert.match(source, /<option value="">Non précisé<\/option>/);
  assert.match(source, /<option value="M">Homme<\/option>/);
  assert.match(source, /<option value="F">Femme<\/option>/);
  assert.match(source, /Charger une image personnelle/);
  assert.match(source, /PNG, JPEG ou WebP · 5 Mo maximum/);
  assert.match(source, /style=\{\{ display: "none" \}\}/);
});
