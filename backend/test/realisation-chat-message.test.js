import assert from "node:assert/strict";
import test from "node:test";

import { buildRealisationChatMessage } from "../realisation-chat-message.js";

const base = {
  who: "Paul",
  route: "« La Traversée »",
  grade: "6a",
  modeRealisation: "en_tete",
};

for (const [styleRealisation, expected] of [
  ["a_vue", "🧗 Paul a enchaîné à vue « La Traversée » — 6a · en tête."],
  ["flash", "⚡ Paul a enchaîné flash « La Traversée » — 6a · en tête."],
  ["travaillee", "✅ Paul a enchaîné « La Traversée » — 6a · en tête."],
  ["projet", "🔧 Paul a travaillé « La Traversée » — 6a · en tête."],
  ["non_enchainee", "🎯 Paul a tenté « La Traversée » — 6a · en tête."],
]) {
  test(`le Chat décrit correctement une réalisation ${styleRealisation}`, () => {
    assert.equal(buildRealisationChatMessage({ ...base, styleRealisation }), expected);
  });
}

test("le Chat conserve le mode moulinette en suffixe", () => {
  assert.equal(
    buildRealisationChatMessage({ ...base, styleRealisation: "flash", modeRealisation: "moulinette" }),
    "⚡ Paul a enchaîné flash « La Traversée » — 6a · en moulinette.",
  );
});
