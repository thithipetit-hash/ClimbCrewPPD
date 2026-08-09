import test from "node:test";
import assert from "node:assert/strict";

import { normalizeRopeNumber } from "../src/route-utils.js";

test("conserve les numéros de corde valides", () => {
  assert.equal(normalizeRopeNumber(0), 0);
  assert.equal(normalizeRopeNumber("0"), 0);
  assert.equal(normalizeRopeNumber(1), 1);
  assert.equal(normalizeRopeNumber("12"), 12);
  assert.equal(normalizeRopeNumber(21), 21);
});

test("convertit les anciennes valeurs vides en corde 0", () => {
  assert.equal(normalizeRopeNumber(""), 0);
  assert.equal(normalizeRopeNumber(null), 0);
  assert.equal(normalizeRopeNumber(undefined), 0);
});

test("ramène les valeurs invalides ou hors plage à la corde 0", () => {
  assert.equal(normalizeRopeNumber("abc"), 0);
  assert.equal(normalizeRopeNumber(-1), 0);
  assert.equal(normalizeRopeNumber(22), 0);
  assert.equal(normalizeRopeNumber(1.5), 0);
});
