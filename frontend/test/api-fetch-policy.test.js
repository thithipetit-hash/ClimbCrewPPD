import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const apiSource = fs.readFileSync(new URL("../src/lib/api.js", import.meta.url), "utf8");

test("apiFetch ne partage plus globalement les GET en cours", () => {
  assert.doesNotMatch(apiSource, /inFlightGetRequests/);
  assert.doesNotMatch(apiSource, /partage sa Promise/);
  assert.match(
    apiSource,
    /export async function apiFetch\(path, options = \{\}\) \{\s*return performApiFetch\(path, options\);\s*\}/,
  );
});
