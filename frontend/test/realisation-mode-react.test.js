import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

import {
  enrichRealisationCreateOptions,
  getPendingRealisationMode,
  setPendingRealisationMode,
} from "../src/lib/realisation-request-mode.js";

const legacyUiUrl = new URL("../src/realisation-mode-ui.js", import.meta.url);
const mainUrl = new URL("../src/main.jsx", import.meta.url);
const modalUrl = new URL("../src/components/RealisationModal.jsx", import.meta.url);
const progressionUrl = new URL("../src/pages/Progression.jsx", import.meta.url);
const profileUrl = new URL("../src/pages/Profil.jsx", import.meta.url);
const hookUrl = new URL("../src/hooks/useRealisationEditorState.js", import.meta.url);

const [mainSource, modalSource, progressionSource, profileSource, hookSource] = await Promise.all([
  readFile(mainUrl, "utf8"),
  readFile(modalUrl, "utf8"),
  readFile(progressionUrl, "utf8"),
  readFile(profileUrl, "utf8"),
  readFile(hookUrl, "utf8"),
]);

test("le POST d'une nouvelle réalisation transporte le mode choisi", () => {
  setPendingRealisationMode("moulinette");
  const prepared = enrichRealisationCreateOptions("/realisations", {
    method: "POST",
    body: JSON.stringify({ id: "r1", styleRealisation: "a_vue" }),
  });
  assert.equal(getPendingRealisationMode(), "moulinette");
  assert.equal(JSON.parse(prepared.body).modeRealisation, "moulinette");
});

test("un mode explicitement présent dans la requête n'est jamais écrasé", () => {
  setPendingRealisationMode("moulinette");
  const prepared = enrichRealisationCreateOptions("/realisations", {
    method: "POST",
    body: JSON.stringify({ modeRealisation: "en_tete", styleRealisation: "flash" }),
  });
  assert.equal(JSON.parse(prepared.body).modeRealisation, "en_tete");
});

test("les autres requêtes API ne sont pas modifiées", () => {
  const options = { method: "POST", body: JSON.stringify({ nom: "Voie" }) };
  assert.equal(enrichRealisationCreateOptions("/routes", options), options);
});

test("le mode et le critère sont rendus directement par React", async () => {
  await assert.rejects(access(legacyUiUrl));
  assert.equal(mainSource.includes("realisation-mode-ui.js"), false);
  assert.match(hookSource, /modeRealisation: "en_tete"/);
  assert.match(modalSource, /<label>Mode<\/label>/);
  assert.match(modalSource, /<label>Critère<\/label>/);
  assert.match(modalSource, /setPendingRealisationMode\(selectedMode\)/);
  assert.match(progressionSource, /getRealisationMode\(realisation, route\)/);
  assert.match(profileSource, /getRealisationMode\(realisation, route\)/);
  assert.doesNotMatch(`${modalSource}\n${progressionSource}\n${profileSource}`, /MutationObserver|window\.location\.reload|querySelectorAll/);
});
