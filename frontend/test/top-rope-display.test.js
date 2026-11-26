import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("la vue condensée signale la moulinette via la réalisation personnelle sans badge supplémentaire", async () => {
  const voies = await readFile(new URL("../src/pages/Voies.jsx", import.meta.url), "utf8");
  const progress = await readFile(new URL("../src/lib/route-progress.js", import.meta.url), "utf8");
  const enhancements = await readFile(new URL("../src/styles/climbcrew-enhancements.css", import.meta.url), "utf8");

  assert.doesNotMatch(voies, /className="pill moulinette-badge"/);
  assert.match(voies, /formatRouteProgress\(myRouteProgress, route\)/);
  assert.match(progress, /formatRealisationModeCriterion\(best, route\)/);
  assert.match(enhancements, /\.route-card\.moulinette-only > \.card-header/);
  assert.match(enhancements, /grid-template-columns:minmax\(0,1fr\)!important/);
});