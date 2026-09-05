import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const legacyModuleUrl = new URL("../src/account-participant-priority.js", import.meta.url);
const legacyRulesUrl = new URL("../src/account-participant-priority-rules.js", import.meta.url);
const mainUrl = new URL("../src/main.jsx", import.meta.url);
const profileUrl = new URL("../src/pages/Profil.jsx", import.meta.url);
const progressionUrl = new URL("../src/pages/Progression.jsx", import.meta.url);

const [mainSource, profileSource, progressionSource] = await Promise.all([
  readFile(mainUrl, "utf8"),
  readFile(profileUrl, "utf8"),
  readFile(progressionUrl, "utf8"),
]);

test("la priorité du grimpeur connecté ne dépend plus d'un MutationObserver", async () => {
  await assert.rejects(access(legacyModuleUrl));
  await assert.rejects(access(legacyRulesUrl));
  assert.equal(mainSource.includes("account-participant-priority.js"), false);
});

test("Profil sélectionne et place directement le grimpeur connecté en tête", () => {
  assert.match(profileSource, /useState\(\(\) => String\(myParticipantId \|\| ""\)\)/);
  assert.match(profileSource, /const aIsMe = String\(a\.id\) === String\(myParticipantId \|\| ""\)/);
  assert.match(profileSource, /if \(aIsMe !== bIsMe\) return aIsMe \? -1 : 1/);
});

test("Progression applique directement le grimpeur connecté par défaut", () => {
  assert.match(progressionSource, /defaultParticipantApplied/);
  assert.match(progressionSource, /selectedParticipantProgress: String\(myParticipantId\)/);
  assert.doesNotMatch(progressionSource, /dispatchEvent|querySelectorAll|MutationObserver/);
});
