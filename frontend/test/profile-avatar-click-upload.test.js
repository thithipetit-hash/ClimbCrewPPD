import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Mon profil ouvre le choix d'image en cliquant sur l'avatar", async () => {
  const source = await readFile(new URL("../src/components/ProfileGecko.jsx", import.meta.url), "utf8");

  assert.match(source, /function handleAvatarImageClick\(\)/);
  assert.match(source, /fileInputRef\.current\?\.click\(\)/);
  assert.match(source, /onClick=\{handleAvatarImageClick\}/);
  assert.match(source, /Cliquer pour changer l’image de profil/);
  assert.match(source, /style=\{\{ display: "none" \}\}/);
  assert.doesNotMatch(source, /Charger une image\s*<input/);
});
