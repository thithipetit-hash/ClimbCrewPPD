import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { buildRealisationPayload } from "../src/lib/realisation-workflow.js";

const legacyUiUrl = new URL("../src/realisation-mode-ui.js", import.meta.url);
const requestBridgeUrl = new URL("../src/lib/realisation-request-mode.js", import.meta.url);
const mainUrl = new URL("../src/main.jsx", import.meta.url);
const modalUrl = new URL("../src/components/RealisationModal.jsx", import.meta.url);
const progressionUrl = new URL("../src/pages/Progression.jsx", import.meta.url);
const profileUrl = new URL("../src/pages/Profil.jsx", import.meta.url);
const hookUrl = new URL("../src/hooks/useRealisationEditorState.js", import.meta.url);
const appUrl = new URL("../src/App.jsx", import.meta.url);

const [mainSource, modalSource, progressionSource, profileSource, hookSource, appSource] = await Promise.all([
  readFile(mainUrl, "utf8"), readFile(modalUrl, "utf8"), readFile(progressionUrl, "utf8"),
  readFile(profileUrl, "utf8"), readFile(hookUrl, "utf8"), readFile(appUrl, "utf8"),
]);

test("le POST d'une nouvelle réalisation transporte directement le mode choisi", () => {
  const payload = buildRealisationPayload({
    draft: { participantId: "p1", selectedDay: "2026-09-05", voieId: "v1", modeRealisation: "moulinette", styleRealisation: "a_vue" },
    sessionId: "s1", now: () => 1,
  });
  assert.equal(payload.modeRealisation, "moulinette");
  assert.equal(payload.styleRealisation, "a_vue");
});

test("le mode et le critère sont rendus et transportés directement par React", async () => {
  await assert.rejects(access(legacyUiUrl));
  await assert.rejects(access(requestBridgeUrl));
  assert.equal(mainSource.includes("realisation-mode-ui.js"), false);
  assert.match(hookSource, /modeRealisation: "en_tete"/);
  assert.match(modalSource, /<label>Mode<\/label>/);
  assert.match(modalSource, /<label>Critère<\/label>/);
  assert.doesNotMatch(modalSource, /setPendingRealisationMode|realisation-request-mode/);
  assert.match(appSource, /buildRealisationPayload\(\{/);
  assert.match(progressionSource, /getRealisationMode\(realisation, route\)/);
  assert.match(profileSource, /getRealisationMode\(realisation, route\)/);
  assert.doesNotMatch(`${modalSource}\n${progressionSource}\n${profileSource}`, /MutationObserver|window\.location\.reload|querySelectorAll/);
});
