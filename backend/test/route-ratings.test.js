import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateRouteRating, ValidationError } from "../validation.js";

test("une note de voie est limitée aux entiers de 1 à 5", () => {
  assert.equal(validateRouteRating(1), 1);
  assert.equal(validateRouteRating("5"), 5);
  for (const value of [0, 6, 2.5, "abc", null]) {
    assert.throws(() => validateRouteRating(value), ValidationError);
  }
});

test("les notes sont rattachées aux réalisations et agrégées par voie", async () => {
  const source = await readFile(new URL("../server.js", import.meta.url), "utf8");
  assert.match(source, /alter table realisations add column if not exists rating/);
  assert.match(source, /left join realisations re on re\.voie_id = r\.id/);
  assert.match(source, /avg\(re\.rating\)/);
});
