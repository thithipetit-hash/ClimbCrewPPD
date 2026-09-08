import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("le bouton indique l'enregistrement d'une voie en cours", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const voies = await readFile(new URL("../src/pages/Voies.jsx", import.meta.url), "utf8");
  assert.match(source, /setSavingRouteId\(route\.id\)/);
  assert.match(source, /finally \{/);
  assert.match(voies, /disabled=\{savingRouteId === route\.id \|\| videoSavingRouteId === route\.id \|\| videoUploadingRouteId === route\.id\}/);
  assert.match(voies, /aria-busy=\{savingRouteId === route\.id \|\| videoSavingRouteId === route\.id \|\| videoUploadingRouteId === route\.id\}/);
  assert.match(voies, /"Enregistrement…" : "Enregistrer"/);
});

test("les vidéos d'une voie sont gérées depuis Modifier et accessibles par le titre", async () => {
  const voies = await readFile(new URL("../src/pages/Voies.jsx", import.meta.url), "utf8");
  assert.match(voies, /Vidéos de la voie/);
  assert.match(voies, /Une URL externe par ligne/);
  assert.match(voies, /videoUrls/);
  assert.match(voies, /Voir les vidéos de cette voie/);
  assert.match(voies, /Voir la vidéo/);
  assert.match(voies, /<video/);
  assert.match(voies, /videoUploadingRouteId/);
  assert.match(voies, /apiUpload/);
});

test("la voie est présentée sur deux lignes sans répéter la corde", async () => {
  const voies = await readFile(new URL("../src/pages/Voies.jsx", import.meta.url), "utf8");
  assert.match(voies, /className="route-primary-line"/);
  assert.match(voies, /className="route-secondary-line"/);
  assert.match(voies, /routeSortMode !== "corde"/);
});

test("les formulaires de réalisation présentent corde, cotation, ouvreur puis nom", async () => {
  const domain = await readFile(new URL("../src/lib/domain.js", import.meta.url), "utf8");
  const modal = await readFile(new URL("../src/components/RealisationModal.jsx", import.meta.url), "utf8");
  const progression = await readFile(new URL("../src/pages/Progression.jsx", import.meta.url), "utf8");
  assert.match(domain, /return \[rope, grade, opener, name\]\.filter\(Boolean\)\.join\(" · "\)/);
  assert.match(modal, /formatRouteForRealisation\(route\)/);
  assert.match(progression, /formatRouteForRealisation\(routeOption\)/);
});

test("les réalisations sont repliables et la voie est choisie dans la fenêtre", async () => {
  const source = await readFile(new URL("../src/pages/Progression.jsx", import.meta.url), "utf8");
  assert.match(source, /<details className="subcard editable-realisation-card progression-realisation-card"/);
  assert.match(source, /<summary className="card-header realisation-summary progression-realisation-summary">/);
  assert.match(source, /openRealisationModal\("", myParticipantId\)/);
  assert.doesNotMatch(source, /progressEntryRouteId/);
  assert.match(source, /!selectedParticipantProgress && `\$\{fullName\(participant\)\} — `/);
  assert.match(source, /\{\(selectedParticipantProgress \|\| selectedRouteProgress\) && <div className="card"/);
  assert.doesNotMatch(source, /Choisis un grimpeur ou une voie pour afficher les réalisations/);
});
