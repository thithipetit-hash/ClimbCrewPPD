import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("les commandes composées d'une icône possèdent un libellé accessible", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");

  assert.match(source, /aria-label=\{viewMode[^\n]+jour précédent/);
  assert.match(source, /aria-label=\{viewMode[^\n]+jour suivant/);
  assert.match(source, /aria-label=\{statsSortDirection[^\n]+ordre décroissant/);
});

test("le clavier et les zones tactiles disposent de styles accessibles", async () => {
  const source = await readFile(
    new URL("../src/climbcrew-enhancements.js", import.meta.url),
    "utf8",
  );

  assert.match(source, /:focus-visible/);
  assert.match(source, /min-width:44px/);
  assert.match(source, /min-height:44px/);
  assert.match(source, /prefers-contrast:more/);
});
