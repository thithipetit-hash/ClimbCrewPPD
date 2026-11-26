import test from "node:test";
import assert from "node:assert/strict";
import { correctImageAspect, observedPauseRatio } from "../src/lib/video-analysis-observations.js";
import { buildTechnicalAnalysisComparison } from "../src/lib/video-analysis-comparison.js";

test("les distances sont dans une même unité pour une vidéo portrait ou paysage", () => {
  assert.deepEqual(correctImageAspect({ x: 0.25, y: 0.5 }, 2), { x: 0.5, y: 0.5 });
  assert.deepEqual(correctImageAspect({ x: 0.5, y: 0.25 }, 0.5), { x: 0.25, y: 0.25 });
  assert.equal(correctImageAspect(null, 2), null);
  assert.equal(correctImageAspect({ x: 0.2, y: 0.3 }, Infinity), null);
});

test("le temps de pause est normalisé sur le temps observé sans compter deux fois les intervalles", () => {
  const metrics = { analyzedSeconds: 20, pauses: [{ start: 6, end: 10 }, { start: 2, end: 8 }] };
  assert.equal(observedPauseRatio(metrics), 0.4);
  assert.equal(observedPauseRatio({ analyzedSeconds: 10, pauses: [] }), 0);
  assert.equal(observedPauseRatio({ analyzedSeconds: 0, pauses: [] }), null);
  assert.equal(observedPauseRatio({ analyzedSeconds: 10 }), null);
  assert.equal(observedPauseRatio({ analyzedSeconds: 10, pauses: [{ start: 5, end: 3 }] }), null);
  assert.equal(observedPauseRatio({ analyzedSeconds: 2, pauses: [{ start: 0, end: 3 }] }), 1);
});

test("la comparaison affiche la part immobile et conserve les valeurs historiques manquantes", () => {
  const a = { metrics: { analyzedSeconds: 10, pauses: [{ start: 0, end: 3 }] } };
  const b = { metrics: { analyzedSeconds: 10 } };
  const row = buildTechnicalAnalysisComparison(a, b).rows.find((item) => item.key === "pauseRatio");
  assert.equal(row.aDisplay, "30 %");
  assert.equal(row.bDisplay, "—");
  assert.equal(row.delta, null);
});
