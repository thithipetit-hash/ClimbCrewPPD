import test from "node:test";
import assert from "node:assert/strict";
import { theCragStyleForRealisation } from "../src/lib/thecrag.js";

test("theCrag distingue le mode du critère", () => {
  assert.equal(theCragStyleForRealisation({ modeRealisation:"moulinette", styleRealisation:"a_vue" }), "Top rope");
  assert.equal(theCragStyleForRealisation({ modeRealisation:"en_tete", styleRealisation:"a_vue" }), "Onsight");
  assert.equal(theCragStyleForRealisation({ modeRealisation:"en_tete", styleRealisation:"flash" }), "Flash");
  assert.equal(theCragStyleForRealisation({ modeRealisation:"en_tete", styleRealisation:"travaillee" }), "Redpoint");
});
