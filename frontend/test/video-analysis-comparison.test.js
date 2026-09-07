import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildTechnicalAnalysisComparison } from "../src/lib/video-analysis-comparison.js";

function analysis({ pauses = 0, footAdjustments = 0, bentLeft = 0, recommendationCode = "stable" } = {}) {
  return {
    metrics: {
      detectionRatio: 0.9,
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
  assert.deepEqual(result.recommendations.map((item) => item.status).sort(), ["only-a", "only-b"]);
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
