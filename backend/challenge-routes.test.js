import assert from "node:assert/strict";
import test from "node:test";
import { cleanIsoDate } from "./challenge-routes.js";

test("accepts real ISO calendar dates, including leap day", () => {
  assert.equal(cleanIsoDate("2028-02-29"), "2028-02-29");
  assert.equal(cleanIsoDate("2026-11-22"), "2026-11-22");
  assert.equal(cleanIsoDate(""), null);
});
test("rejects invalid dates and missing required dates", () => {
  for (const date of ["2026-02-29", "2026-02-30", "2026-04-31", "2026-13-01", "bad"]) {
    assert.throws(() => cleanIsoDate(date), /Date invalide/);
  }
  assert.throws(() => cleanIsoDate("", { required: true }), /obligatoire/);
});
