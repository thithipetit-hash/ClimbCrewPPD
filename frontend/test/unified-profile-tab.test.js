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

test("Profil importe le formateur de voie utilisé pour les réalisations", () => {
  assert.match(profileSource, /formatRouteForRealisation,/);
  assert.match(profileSource, /route \? formatRouteForRealisation\(route\) : "Voie inconnue"/);
});

test("Profil récupère la fonction de rafraîchissement des réalisations depuis le hook", () => {
  assert.match(profileSource, /const \{\s*refreshRealisations,\s*resetOwnRealisations,/);
  assert.match(profileSource, /await refreshRealisations\(\)/);
  assert.match(profileSource, /onSaved=\{refreshRealisations\}/);
});

test("les réglages privés restent réservés au profil connecté", () => {
  assert.match(profileSource, /const isOwnProfile =/);
  assert.match(profileSource, /\{isOwnProfile && \(/);
  assert.match(profileSource, /editable=\{isOwnProfile\}/);
  assert.match(profileSource, /profilePublic !== false/);
});

test("Profil affiche le tableau filtrable des voies du grimpeur", () => {
  assert.match(profileSource, /buildRouteRealisationStatistics\(Object\.values\(routesById \|\| \{\}\), selectedRealisations\)/);
  assert.match(profileSource, /<RouteRealisationStatisticsTable/);
  assert.match(profileSource, /title="Voies du grimpeur"/);
});

test("le recalcul des statistiques et du CPR reste réservé au propriétaire du profil", () => {
  assert.match(profileSource, /onRecalculateStats,/);
  assert.match(profileSource, /if \(!isOwnProfile \|\| statsRecalculating\) return/);
  assert.match(profileSource, /Recalculer mes statistiques et mon CPR/);
  assert.match(profileSource, /onConfirm: handleRecalculateOwnStats/);
  assert.match(profileSource, /await onRecalculateStats\(\)/);
});
