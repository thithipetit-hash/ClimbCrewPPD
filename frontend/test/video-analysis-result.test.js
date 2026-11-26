import test from "node:test";
import assert from "node:assert/strict";
import { selectAnalysisUrl, resolveDisplayedAnalysis } from "../src/lib/video-analysis-result.js";

test("les analyses existantes sont prioritaires sur les vidéos non analysées", () => {
  assert.equal(selectAnalysisUrl("", ["new", "saved"], ["saved"]), "saved");
  assert.equal(selectAnalysisUrl("new", ["new", "saved"], ["saved"]), "new");
  assert.equal(selectAnalysisUrl("deleted", ["saved"], ["saved"]), "saved");
  assert.equal(selectAnalysisUrl("", [], []), "");
});
test("un résultat calculé survit au rafraîchissement et à un échec de sauvegarde sans fuir vers une autre vidéo", () => {
  const result = {metrics:{duration:40}};
  const computed = {url:"video-a",analysis:result};
  assert.equal(resolveDisplayedAnalysis("video-a",computed,{}),result);
  assert.equal(resolveDisplayedAnalysis("video-a",computed,{"video-a":{metrics:{duration:10}}}),result);
  assert.equal(resolveDisplayedAnalysis("video-b",computed,{}),null);
  assert.equal(resolveDisplayedAnalysis("video-b",computed,{"video-b":result}),result);
});
