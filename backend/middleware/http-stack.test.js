import assert from "node:assert/strict";
import test from "node:test";
import { normalizeApiPath } from "./http-stack.js";

test("normalise les préfixes API historiques sans perdre la query string", () => {
  assert.equal(normalizeApiPath("/api/participants?x=1"), "/participants?x=1");
  assert.equal(normalizeApiPath("/v1/routes"), "/routes");
  assert.equal(normalizeApiPath("/api/v1/sessions"), "/sessions");
  assert.equal(normalizeApiPath("/api"), "/");
});

test("conserve un chemin déjà canonique", () => {
  assert.equal(normalizeApiPath("/health"), "/health");
});
