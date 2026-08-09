import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("les voies en moulinette utilisent un badge compact séparé des actions", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const enhancements = await readFile(new URL("../src/climbcrew-enhancements.js", import.meta.url), "utf8");

  assert.match(app, /className="pill moulinette-badge"/);
  assert.match(app, />Moulinette<\/span>/);
  assert.match(enhancements, /\.route-card\.moulinette-only > \.card-header/);
  assert.match(enhancements, /grid-template-columns:minmax\(0,1fr\)!important/);
});
