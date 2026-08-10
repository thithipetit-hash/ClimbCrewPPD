import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("le bouton indique l'enregistrement d'une voie en cours", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");

  assert.match(source, /setSavingRouteId\(route\.id\)/);
  assert.match(source, /finally \{/);
  assert.match(source, /disabled=\{savingRouteId === route\.id\}/);
  assert.match(source, /aria-busy=\{savingRouteId === route\.id\}/);
  assert.match(source, /"Enregistrement…" : "Enregistrer"/);
});

test("la voie est présentée sur deux lignes sans répéter la corde", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");

  assert.match(source, /className="route-primary-line"/);
  assert.match(source, /className="route-secondary-line"/);
  assert.match(source, /routeSortMode !== "corde"/);
});

test("les formulaires de réalisation présentent corde, cotation, ouvreur puis nom", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(source, /return \[rope, grade, opener, name\]\.filter\(Boolean\)\.join\(" · "\)/);
  assert.match(source, /formatRouteForRealisation\(realisationModalRoute\)/);
  assert.match(source, /formatRouteForRealisation\(routeOption\)/);
});

test("les réalisations sont repliables et la voie est choisie dans la fenêtre", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(source, /<details className="subcard editable-realisation-card"/);
  assert.match(source, /<summary className="card-header realisation-summary">/);
  assert.match(source, /openRealisationModal\("", state\.selectedParticipantProgress\)/);
  assert.doesNotMatch(source, /progressEntryRouteId/);
  assert.match(source, /!state\.selectedParticipantProgress && `\$\{fullName\(participant\)\} — `/);
  assert.match(source, /\{\(state\.selectedParticipantProgress \|\| selectedRouteProgress\) && <div className="card"/);
  assert.doesNotMatch(source, /Choisis un grimpeur ou une voie pour afficher les réalisations/);
});
