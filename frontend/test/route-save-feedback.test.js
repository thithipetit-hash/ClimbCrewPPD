import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("le bouton indique l'enregistrement d'une voie en cours", async () => {
  const source = await readFile(new URL("../src/hooks/useRouteManagement.js", import.meta.url), "utf8");
  const voies = await readFile(new URL("../src/pages/Voies.jsx", import.meta.url), "utf8");
  assert.match(source, /setSavingRouteId\(route\.id\)/);
  assert.match(source, /finally \{/);
  assert.match(voies, /disabled=\{savingRouteId === route\.id \|\| videoSavingRouteId === route\.id \|\| videoUploadingRouteId === route\.id\}/);
  assert.match(voies, /aria-busy=\{savingRouteId === route\.id \|\| videoSavingRouteId === route\.id \|\| videoUploadingRouteId === route\.id\}/);
  assert.match(voies, /"Enregistrement…" : "Enregistrer"/);
});

test("les vidéos d'une voie sont gérées depuis Modifier et restent accessibles depuis la vue condensée", async () => {
  const voies = await readFile(new URL("../src/pages/Voies.jsx", import.meta.url), "utf8");
  assert.match(voies, /Vidéos de la voie/);
  assert.match(voies, /Une URL externe par ligne/);
  assert.match(voies, /videoUrls/);
  assert.match(voies, /Vidéos · \{videoCount\}/);
  assert.match(voies, /Voir la vidéo/);
  assert.match(voies, /<video/);
  assert.match(voies, /videoUploadingRouteId/);
  assert.match(voies, /apiUpload/);
});

test("la vue condensée ne conserve que cotation, couleur et réalisation personnelle", async () => {
  const voies = await readFile(new URL("../src/pages/Voies.jsx", import.meta.url), "utf8");
  assert.match(voies, /className="route-primary-line">\{route\.cotationAjustee \|\| route\.cotationReference \|\| "nc"\} · \{route\.couleurPrises \|\| "Sans couleur"\}/);
  assert.match(voies, /aria-label="Réalisation du grimpeur connecté"/);
  assert.match(voies, /formatRouteProgress\(myRouteProgress, route\)/);
  assert.match(voies, /id="route-realisation-filter"/);
  assert.match(voies, /ROUTE_REALISATION_FILTER_OPTIONS/);
  assert.doesNotMatch(voies, /Consensus \{routeAggregatesById/);
  assert.doesNotMatch(voies, /rating-average/);
});

test("les formulaires de réalisation présentent corde, couleur, cotation, ouvreur puis nom", async () => {
  const domain = await readFile(new URL("../src/lib/domain.js", import.meta.url), "utf8");
  const modal = await readFile(new URL("../src/components/RealisationModal.jsx", import.meta.url), "utf8");
  const progression = await readFile(new URL("../src/pages/Progression.jsx", import.meta.url), "utf8");
  assert.match(domain, /return \[rope, color, grade, opener, name\]\.filter\(Boolean\)\.join\(" · "\)/);
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