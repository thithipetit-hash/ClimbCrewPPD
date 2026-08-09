import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("la note de une à cinq étoiles est saisie avec la réalisation", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(source, /\[1, 2, 3, 4, 5\]\.map/);
  assert.match(source, /role="radiogroup"/);
  assert.match(source, /newRealisation\.rating/);
  assert.match(source, /routeRatingsById/);
  assert.match(source, /routeRating\.average\.toFixed\(1\)/);
  assert.match(source, /Pas encore notée \(0 réalisation\)/);
});
