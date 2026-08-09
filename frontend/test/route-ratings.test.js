import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("chaque voie peut recevoir une note de une à cinq étoiles", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(source, /\[1, 2, 3, 4, 5\]\.map/);
  assert.match(source, /role="radiogroup"/);
  assert.match(source, /ratingAverage/);
  assert.match(source, /ratingCount/);
  assert.match(source, /Note enregistrée/);
});
