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

test("une seule note par compte et par voie est conservée", async () => {
  const source = await readFile(new URL("../server.js", import.meta.url), "utf8");
  assert.match(source, /primary key \(route_id, user_id\)/);
  assert.match(source, /on conflict \(route_id, user_id\)/);
  assert.match(source, /avg\(rating\)/);
});
