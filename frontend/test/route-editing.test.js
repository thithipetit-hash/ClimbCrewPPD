import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("la modification d'une voie n'envoie que les champs éditables", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");

  assert.match(source, /const routePatch = \{/);
  assert.match(source, /body: JSON\.stringify\(routePatch\)/);
  assert.doesNotMatch(source, /body: JSON\.stringify\(updatedRoute\)/);
});

test("une erreur de modification est affichée dans la carte de la voie", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");

  assert.match(source, /setRouteError\(""\);/);
  assert.match(source, /routeError && <div className="error" style=\{\{ marginTop: 8 \}\}>\{routeError\}<\/div>/);
});
