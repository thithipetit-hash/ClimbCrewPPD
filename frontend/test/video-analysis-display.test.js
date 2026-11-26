import test from "node:test";
import assert from "node:assert/strict";
import { buildVideoDisplay, nearestPoseFrame, timelineItems, comparisonGraphRows } from "../src/lib/video-analysis-display.js";
import { buildTechnicalAnalysisComparison } from "../src/lib/video-analysis-comparison.js";

test("les graphiques distinguent valeurs manquantes et zéro", () => {
  const empty = buildVideoDisplay({});
  assert.equal(empty.pauseRatio, null);
  assert.equal(empty.armLeftRatio, null);
  assert.equal(empty.domains[1].observations[0][1], null);
  const result = buildVideoDisplay({ analyzedSeconds: 20, pauses: [], bentArmSeconds: { left: 5, right: 0 } });
  assert.equal(result.pauseRatio, 0);
  assert.equal(result.armLeftRatio, .25);
  assert.equal(result.armRightRatio, 0);
});
test("le squelette ne comble pas les images non observées", () => {
  const frames = [{time:0, points:[{}]}, {time:.25, points:[null]}, {time:1, points:[{}]}];
  assert.equal(nearestPoseFrame(frames,.24,4), frames[1]);
  assert.equal(nearestPoseFrame(frames,.6,4), null);
  assert.equal(nearestPoseFrame([],0,4), null);
});
test("chronologie bornée à la durée de la vidéo", () => {
  const result = timelineItems({duration:10, pauses:[{start:1,end:3},{start:9,end:12}], events:[{type:"dynamic",time:6},{type:"foot-adjustment",time:-1}]});
  assert.deepEqual(result,[{kind:"pause",start:1,end:3},{kind:"dynamic",start:6,end:6}]);
});
test("comparaison graphique sans valeurs inventées et compatibilité explicite", () => {
  const a={engineVersion:"1.4.0",rules:{sampleFps:4},metrics:{duration:20}};
  const b={engineVersion:"1.3.2",rules:{sampleFps:4},metrics:{duration:18}};
  const result=buildTechnicalAnalysisComparison(a,b);
  assert.equal(result.comparable,false);
  assert.deepEqual(comparisonGraphRows(result).map(r=>r.key),["duration"]);
  assert.equal(buildTechnicalAnalysisComparison(a,a).comparable,true);
});
