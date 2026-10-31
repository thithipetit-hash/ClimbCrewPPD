import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { GRADES } from "../src/lib/domain.js";
import { GRADES as SHARED_GRADES } from "../../shared/climbing-grades.js";

const [appSource, chatSource, profileSource, routesSource, sessionCardSource] = await Promise.all([
  readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/pages/Chat.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/pages/Profil.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/pages/Voies.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/SessionCard.jsx", import.meta.url), "utf8"),
]);

test("l'échelle de cotation frontend provient de la source partagée", () => {
  assert.deepEqual(GRADES, SHARED_GRADES);
  assert.ok(GRADES.includes("4a+"));
  assert.ok(GRADES.includes("7c+"));
});

test("la carte séance est extraite de App et conserve la capacité partagée", () => {
  assert.match(appSource, /import SessionCard from ".\/components\/SessionCard\.jsx"/);
  assert.match(appSource, /<SessionCard/);
  assert.doesNotMatch(appSource, /className="participant-row passport-row.*session\.status/s);
  assert.match(sessionCardSource, /MAX_PARTICIPANTS/);
});

test("les écrans audités n'utilisent plus les dialogues navigateur natifs", () => {
  for (const [name, source] of [
    ["App", appSource],
    ["Chat", chatSource],
    ["Profil", profileSource],
    ["Voies", routesSource],
  ]) {
    assert.doesNotMatch(source, /window\.(?:confirm|prompt)\s*\(/, name);
    assert.doesNotMatch(source, /\balert\s*\(/, name);
  }
});

test("le Chat réserve l'épinglage aux administrateurs et utilise des formulaires React", () => {
  assert.match(chatSource, /canPin = false/);
  assert.match(chatSource, /canPin && <button[^>]*>.*Épingler/s);
  assert.match(chatSource, /pollQuestion/);
  assert.match(chatSource, /editingMessage/);
  assert.match(chatSource, /ConfirmDialog/);
});

test("le profil ne propose plus de Kudo sur ses propres réalisations", () => {
  assert.match(profileSource, /!isOwnProfile && <div className="group".*Kudo/s);
});
