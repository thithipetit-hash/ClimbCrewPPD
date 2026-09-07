import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/lib/mediapipe-video-analysis.js", import.meta.url), "utf8");

test("un repère non visible produit une mesure absente et non une vitesse nulle", () => {
  assert.match(
    source,
    /export function normalizeObservedSpeed\([\s\S]*?if \(!previous \|\| !current \|\| !torsoLength \|\| !dt\) return null;/,
  );
  assert.doesNotMatch(source, /if \(!previous \|\| !current \|\| !torsoLength \|\| !dt\) return 0;/);
});

test("les intervalles techniques sont fermés au dernier échantillon visible", () => {
  assert.match(source, /finishTrackedIntervals\(previousTime\)/);
  assert.doesNotMatch(source, /finishInterval\(pauses, pauseStart, duration/);
  assert.match(source, /engineVersion: "1\.0\.3"/);
  assert.match(source, /previousPose\.leftAnkle && pose\.leftAnkle/);
});
