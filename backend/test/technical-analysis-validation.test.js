import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTechnicalAnalysis } from "../technical-analysis-validation.js";

const rules = {
  sampleFps: 4,
  minVisibility: 0.5,
  pauseSpeedTorsoPerSecond: 0.08,
  pauseMinSeconds: 2.5,
  longPauseMinSeconds: 5,
  bentArmAngleDegrees: 120,
  bentArmMinSeconds: 2,
  lockOffAngleDegrees: 100,
  lockOffMinSeconds: 1,
  footAdjustmentSpeedTorsoPerSecond: 0.12,
  footAdjustmentMaxDistanceTorso: 0.35,
  footAdjustmentMinGapSeconds: 0.7,
  dynamicSpeedTorsoPerSecond: 1.6,
  armAsymmetryRatio: 0.25,
};

function validAnalysis() {
  return {
    engine: "MediaPipe Pose Landmarker Lite",
    engineVersion: "1.0.3",
    localProcessing: true,
    rules,
    metrics: {
      duration: 60,
      analyzedSeconds: 54,
      sampleCount: 100,
      validSamples: 90,
      detectionRatio: 0.9,
      pauses: [{ start: 10, end: 13, duration: 3 }],
      longPauses: [],
      bentArmSeconds: { left: 8, right: 6 },
      lockOffSeconds: { left: 2, right: 1 },
      footAdjustments: { left: 2, right: 3, total: 5 },
      dynamicMoves: 2,
      armAsymmetryRatio: 0.25,
    },
    recommendations: [{
      code: "foot-adjustments",
      severity: "warning",
      title: "Précision des pieds",
      detail: "Revoir les placements.",
    }],
    display: { duration: "1:00", detection: "90 %" },
    coach: { injected: true },
  };
}

test("normalise uniquement le schéma technique attendu", () => {
  const result = normalizeTechnicalAnalysis(validAnalysis());
  assert.equal(result.engineVersion, "1.0.3");
  assert.equal(result.storageVersion, 2);
  assert.equal(result.metrics.footAdjustments.total, 5);
  assert.equal("coach" in result, false);
  assert.ok(result.analyzedAt);
});

test("refuse un ratio de détection incohérent", () => {
  const value = validAnalysis();
  value.metrics.detectionRatio = 0.5;
  assert.throws(() => normalizeTechnicalAnalysis(value), /ratio de détection/i);
});

test("refuse un total de pieds fabriqué", () => {
  const value = validAnalysis();
  value.metrics.footAdjustments.total = 99;
  assert.throws(() => normalizeTechnicalAnalysis(value), /total des ajustements/i);
});

test("refuse un moteur ou des règles hors limites", () => {
  const badEngine = validAnalysis();
  badEngine.engine = "fake";
  assert.throws(() => normalizeTechnicalAnalysis(badEngine), /moteur/i);

  const badRules = validAnalysis();
  badRules.rules.sampleFps = 100;
  assert.throws(() => normalizeTechnicalAnalysis(badRules), /sampleFps/);
});
