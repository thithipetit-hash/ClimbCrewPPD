import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildTechnicalAnalysisComparison } from "../src/lib/video-analysis-comparison.js";

function analysis({
  pauses = 0,
  footAdjustments = 0,
  bentLeft = 0,
  recommendationCode = "stable",
  analyzedSeconds = 60,
  engineVersion = "1.0.3",
  rules = { sampleFps: 4, minVisibility: 0.5 },
} = {}) {
  return {
    engineVersion,
    rules,
    metrics: {
      duration: 70,
      analyzedSeconds,
      detectionRatio: analyzedSeconds / 70,
      pauses: Array.from({ length: pauses }, (_, index) => ({ start: index, end: index + 1 })),
      longPauses: [],
      footAdjustments: { total: footAdjustments },
      dynamicMoves: 1,
      bentArmSeconds: { left: bentLeft, right: 2 },
      lockOffSeconds: { left: 1, right: 0 },
      armAsymmetryRatio: 0.1,
    },
    recommendations: [{ code: recommendationCode, title: recommendationCode, detail: `detail-${recommendationCode}` }],
  };
}

test("compare les mesures enregistrées sans dépendre des fichiers vidéo", () => {
  const result = buildTechnicalAnalysisComparison(
    analysis({ pauses: 3, footAdjustments: 5, bentLeft: 7, recommendationCode: "feet" }),
    analysis({ pauses: 1, footAdjustments: 2, bentLeft: 4, recommendationCode: "flow" }),
  );

  assert.equal(result.rows.find((row) => row.key === "pauses").delta, -2);
  assert.equal(result.rows.find((row) => row.key === "footAdjustments").delta, -3);
  assert.equal(result.rows.find((row) => row.key === "bentLeft").delta, -3);
  assert.equal(result.rows.find((row) => row.key === "pausesPerMinute").a, 3);
  assert.deepEqual(result.recommendations.map((item) => item.status).sort(), ["only-a", "only-b"]);
});

test("une mesure historique absente reste absente et ne devient jamais zéro", () => {
  const older = analysis();
  delete older.metrics.lockOffSeconds.left;
  const result = buildTechnicalAnalysisComparison(older, analysis());
  const row = result.rows.find((item) => item.key === "lockLeft");
  assert.equal(row.a, null);
  assert.equal(row.delta, null);
  assert.equal(row.aDisplay, "—");
  assert.equal(row.deltaDisplay, "—");
});

test("la comparaison signale un moteur ou des règles différents", () => {
  const result = buildTechnicalAnalysisComparison(
    analysis({ engineVersion: "1.0.2", rules: { sampleFps: 3, minVisibility: 0.5 } }),
    analysis({ engineVersion: "1.0.3", rules: { sampleFps: 4, minVisibility: 0.5 } }),
  );
  assert.match(result.rows.find((row) => row.key === "engineVersion").deltaDisplay, /Différente/);
  assert.match(result.rows.find((row) => row.key === "rulesCompatibility").deltaDisplay, /Différentes/);
});

test("identifie une recommandation commune aux deux analyses", () => {
  const result = buildTechnicalAnalysisComparison(
    analysis({ recommendationCode: "bent-arm" }),
    analysis({ recommendationCode: "bent-arm" }),
  );
  assert.equal(result.recommendations[0].status, "common");
});

test("l'interface de comparaison reste strictement fondée sur les mesures", async () => {
  const source = await readFile(new URL("../src/components/VideoTechnicalAnalysis.jsx", import.meta.url), "utf8");
  assert.match(source, /Comparer les mesures/);
  assert.match(source, /sans charger une seconde vidéo/);
  assert.equal((source.match(/<video/g) || []).length, 1);
});
