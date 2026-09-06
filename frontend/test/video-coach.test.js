import assert from "node:assert/strict";
import test from "node:test";
import { buildClimbingCoach } from "../src/lib/climbing-coach.js";

function baseMetrics(overrides = {}) {
  return {
    duration: 40,
    analyzedSeconds: 40,
    detectionRatio: 0.95,
    pauses: [],
    longPauses: [],
    bentArmSeconds: { left: 2, right: 2 },
    footAdjustments: { left: 0, right: 0, total: 0 },
    dynamicMoves: 0,
    armAsymmetryRatio: 0,
    ...overrides,
  };
}

test("la couche entraîneur limite le coaching aux deux priorités les plus fortes", () => {
  const coach = buildClimbingCoach(baseMetrics({
    pauses: [{ start: 1, end: 6, duration: 5 }, { start: 12, end: 18, duration: 6 }],
    longPauses: [{ start: 1, end: 6, duration: 5 }, { start: 12, end: 18, duration: 6 }],
    bentArmSeconds: { left: 14, right: 4 },
    footAdjustments: { left: 4, right: 5, total: 9 },
    armAsymmetryRatio: 0.7,
    dynamicMoves: 5,
  }), { longPauseMinSeconds: 4, armAsymmetryRatio: 0.35 });

  assert.equal(coach.method, "rule-based");
  assert.equal(coach.priorities.length, 2);
  assert.deepEqual(coach.priorities.map((item) => item.code), ["coach-fluidity", "coach-foot-precision"]);
});

test("la couche entraîneur propose une consolidation quand aucun signal ne ressort", () => {
  const coach = buildClimbingCoach(baseMetrics());
  assert.equal(coach.priorities.length, 1);
  assert.equal(coach.priorities[0].code, "coach-consolidation");
});

test("une asymétrie est présentée comme une piste à confirmer selon la voie", () => {
  const coach = buildClimbingCoach(baseMetrics({ armAsymmetryRatio: 0.6 }), { armAsymmetryRatio: 0.35 });
  assert.equal(coach.priorities[0].code, "coach-arm-balance");
  assert.match(coach.priorities[0].caution, /voie/i);
});
