import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

test("App délègue les gros blocs métier aux hooks dédiés", () => {
  assert.match(app, /useAppDerivedData\(/);
  assert.match(app, /useSessionActions\(/);
  assert.match(app, /useRouteActions\(/);
  assert.match(app, /useRealisationActions\(/);
  assert.doesNotMatch(app, /function buildDefaultSession/);
  assert.doesNotMatch(app, /async function addRoute\(/);
  assert.doesNotMatch(app, /async function addRealisation\(/);
  assert.doesNotMatch(app, /const sessionStats = useMemo/);
});
