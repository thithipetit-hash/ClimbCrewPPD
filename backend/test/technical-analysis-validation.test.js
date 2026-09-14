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
    rules: { ...rules },
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

test("refuse un temps analysé incohérent avec le ratio", () => {
  const value = validAnalysis();
  value.metrics.analyzedSeconds = 20;
  assert.throws(() => normalizeTechnicalAnalysis(value), /temps analysé/i);
});

test("refuse un total de pieds fabriqué", () => {
  const value = validAnalysis();
  value.metrics.footAdjustments.total = 99;
  assert.throws(() => normalizeTechnicalAnalysis(value), /total des ajustements/i);
});

test("refuse un moteur, une version ou un mode de traitement invalides", () => {
  const badEngine = validAnalysis();
  badEngine.engine = "fake";
  assert.throws(() => normalizeTechnicalAnalysis(badEngine), /moteur/i);

  const badVersion = validAnalysis();
  badVersion.engineVersion = "v1";
  assert.throws(() => normalizeTechnicalAnalysis(badVersion), /version/i);

  const remote = validAnalysis();
  remote.localProcessing = false;
  assert.throws(() => normalizeTechnicalAnalysis(remote), /localement/i);
});

test("refuse les règles hors limites et les incohérences entre seuils", () => {
  const badRules = validAnalysis();
  badRules.rules.sampleFps = 100;
  assert.throws(() => normalizeTechnicalAnalysis(badRules), /sampleFps/);

  const badPause = validAnalysis();
  badPause.rules.longPauseMinSeconds = 2;
  badPause.rules.pauseMinSeconds = 3;
  assert.throws(() => normalizeTechnicalAnalysis(badPause), /longue pause/i);

  const badLock = validAnalysis();
  badLock.rules.lockOffAngleDegrees = 125;
  badLock.rules.bentArmAngleDegrees = 120;
  assert.throws(() => normalizeTechnicalAnalysis(badLock), /lock-off/i);
});

test("refuse les intervalles invalides ou incohérents", () => {
  const outside = validAnalysis();
  outside.metrics.pauses = [{ start: 59, end: 61 }];
  assert.throws(() => normalizeTechnicalAnalysis(outside), /metrics\.pauses/i);

  const badDuration = validAnalysis();
  badDuration.metrics.pauses = [{ start: 10, end: 13, duration: 8 }];
  assert.throws(() => normalizeTechnicalAnalysis(badDuration), /duration est incohérente/i);
});

test("refuse les métriques numériques hors limites", () => {
  for (const mutate of [
    (v) => { v.metrics.duration = 481; },
    (v) => { v.metrics.sampleCount = 0; },
    (v) => { v.metrics.validSamples = 101; },
    (v) => { v.metrics.dynamicMoves = -1; },
    (v) => { v.metrics.armAsymmetryRatio = 1.1; },
  ]) {
    const value = validAnalysis();
    mutate(value);
    assert.throws(() => normalizeTechnicalAnalysis(value), /hors limites/i);
  }
});

test("refuse les recommandations invalides et accepte les trois sévérités", () => {
  for (const severity of ["success", "info", "warning"]) {
    const value = validAnalysis();
    value.recommendations[0].severity = severity;
    assert.equal(normalizeTechnicalAnalysis(value).recommendations[0].severity, severity);
  }

  const badSeverity = validAnalysis();
  badSeverity.recommendations[0].severity = "critical";
  assert.throws(() => normalizeTechnicalAnalysis(badSeverity), /severity est invalide/i);

  const tooMany = validAnalysis();
  tooMany.recommendations = Array.from({ length: 21 }, () => ({
    code: "x", severity: "info", title: "x", detail: "x",
  }));
  assert.throws(() => normalizeTechnicalAnalysis(tooMany), /recommandations/i);
});

test("nettoie l'affichage optionnel et refuse les chaînes trop longues", () => {
  const value = validAnalysis();
  value.display = { duration: "1:00", detection: "", unknown: "ignored" };
  const result = normalizeTechnicalAnalysis(value);
  assert.deepEqual(result.display, { duration: "1:00" });

  const longTitle = validAnalysis();
  longTitle.recommendations[0].title = "x".repeat(161);
  assert.throws(() => normalizeTechnicalAnalysis(longTitle), /title.*invalide/i);
});

test("refuse les structures absentes ou du mauvais type", () => {
  assert.throws(() => normalizeTechnicalAnalysis(null), /résultat d’analyse technique/i);

  const badRules = validAnalysis();
  badRules.rules = [];
  assert.throws(() => normalizeTechnicalAnalysis(badRules), /règles d’analyse/i);

  const badMetrics = validAnalysis();
  badMetrics.metrics = null;
  assert.throws(() => normalizeTechnicalAnalysis(badMetrics), /mesures/i);
});
