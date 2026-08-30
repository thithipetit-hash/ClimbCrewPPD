import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const hook = fs.readFileSync(new URL("../src/hooks/useAppBootstrap.js", import.meta.url), "utf8");

test("App délègue le bootstrap API et authentification", () => {
  assert.match(app, /useAppBootstrap\(/);
  assert.doesNotMatch(app, /authApiFetch\("\/auth\/me"/);
  assert.doesNotMatch(app, /authApiFetch\("\/auth\/broadcast-messages\/pending"/);
  assert.doesNotMatch(app, /Recharge toutes les données depuis le backend/);
});

test("le hook de bootstrap centralise chargement, identité et messages", () => {
  assert.match(hook, /apiFetch\("\/participants"/);
  assert.match(hook, /apiFetch\("\/sessions"/);
  assert.match(hook, /apiFetch\("\/routes"/);
  assert.match(hook, /authApiFetch\("\/auth\/me"/);
  assert.match(hook, /authApiFetch\("\/auth\/broadcast-messages\/pending"/);
  assert.match(hook, /return \{ reloadApiState \}/);
});
