import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const uiConfig = fs.readFileSync(new URL("../src/lib/ui-config.js", import.meta.url), "utf8");
const profileSource = fs.readFileSync(new URL("../src/pages/Profil.jsx", import.meta.url), "utf8");

test("la navigation expose un seul onglet Profil", () => {
  assert.match(uiConfig, /key: "mon_profil", label: "Profil"/);
  assert.doesNotMatch(uiConfig, /key: "progression"/);
  assert.doesNotMatch(uiConfig, /label: "Mon Profil"/);
});

test("Profil sélectionne le grimpeur connecté par défaut et permet d'en choisir un autre", () => {
  assert.match(profileSource, /useState\(\(\) => String\(myParticipantId \|\| ""\)\)/);
  assert.match(profileSource, /id="profile-climber-select"/);
  assert.match(profileSource, /setSelectedParticipantId\(event\.target\.value\)/);
  assert.match(profileSource, /apiFetch\("\/participants"\)/);
});

test("les réglages privés restent réservés au profil connecté", () => {
  assert.match(profileSource, /const isOwnProfile =/);
  assert.match(profileSource, /\{isOwnProfile && \(/);
  assert.match(profileSource, /editable=\{isOwnProfile\}/);
  assert.match(profileSource, /profilePublic !== false/);
});
