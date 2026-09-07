import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeObservedSpeed } from "../src/lib/mediapipe-video-analysis.js";

test("un repère non visible produit une mesure absente et non une vitesse nulle", () => {
  const visible = { x: 0, y: 0 };
  assert.equal(normalizeObservedSpeed(null, visible, 1, 0.1), null);
  assert.equal(normalizeObservedSpeed(visible, null, 1, 0.1), null);
  assert.equal(normalizeObservedSpeed(visible, { x: 0.1, y: 0 }, 1, 0.1), 1);
});

test("les intervalles techniques sont fermés au dernier échantillon visible", async () => {
  const source = await readFile(new URL("../src/lib/mediapipe-video-analysis.js", import.meta.url), "utf8");
  assert.match(source, /finishTrackedIntervals\(previousTime\)/);
  assert.doesNotMatch(source, /finishInterval\(pauses, pauseStart, duration/);
  assert.match(source, /engineVersion: "1\.0\.3"/);
  assert.match(source, /previousPose\.leftAnkle && pose\.leftAnkle/);
});
