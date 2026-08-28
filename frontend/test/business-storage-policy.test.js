import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const mainSource = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
const stateHookSource = await readFile(new URL("../src/hooks/useAppBusinessState.js", import.meta.url), "utf8");

test("App délègue la persistance métier à un hook dédié", () => {
  assert.match(appSource, /useAppBusinessState\(\)/);
  assert.doesNotMatch(appSource, /localStorage\.setItem\("climbcrew_local_data_v2"/);
  assert.doesNotMatch(appSource, /localStorage\.getItem\("climbcrew_local_data_v2"/);
});

test("la politique ne surcharge plus globalement Storage.prototype", () => {
  assert.doesNotMatch(mainSource, /business-storage-policy/);
  assert.doesNotMatch(stateHookSource, /Storage\.prototype\.setItem\s*=/);
});

test("le hook supprime le cache historique et refuse sa persistance en mode API", () => {
  assert.match(stateHookSource, /BUSINESS_STORAGE_KEY\s*=\s*"climbcrew_local_data_v2"/);
  assert.match(stateHookSource, /if \(useApi\)[\s\S]*removeItem\(BUSINESS_STORAGE_KEY\)/);
  assert.match(stateHookSource, /export function persistBusinessState[\s\S]*if \(useApi\) return/);
});
