import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const inscriptions = fs.readFileSync(new URL("../src/pages/Inscriptions.jsx", import.meta.url), "utf8");
const main = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../src/styles/mobile-session-compact.css", import.meta.url), "utf8");

test("la compaction mobile des inscriptions reste isolée à sa page", () => {
  assert.match(inscriptions, /className="inscriptions-page"/);
  assert.match(main, /mobile-session-compact\.css/);
  assert.match(css, /@media \(max-width: 700px\)/);
  assert.match(css, /\.inscriptions-page \.session-participant-list \.participant-row/);
  assert.match(css, /height:\s*24px/);
  assert.doesNotMatch(css, /^\s*\.app\s*\{/m);
  assert.doesNotMatch(css, /^\s*\.hero\s*\{/m);
});

test("la compaction conserve les noms lisibles sans débordement horizontal", () => {
  assert.match(css, /\.participant-name[\s\S]*text-overflow:\s*ellipsis/);
  assert.match(css, /\.participant-identity[\s\S]*min-width:\s*0/);
  assert.match(css, /\.date-nav[\s\S]*minmax\(0, 1fr\)/);
});
