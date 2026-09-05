import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  isEligibleForFreeSession,
  normalizeSessionPassport,
} from "../src/session-status-display-rules.js";

test("une séance libre accepte uniquement les passeports jaune, orange, vert et bleu", () => {
  assert.equal(isEligibleForFreeSession("jaune"), true);
  assert.equal(isEligibleForFreeSession("Orange"), true);
  assert.equal(isEligibleForFreeSession("VERT"), true);
  assert.equal(isEligibleForFreeSession("bleu"), true);

  assert.equal(isEligibleForFreeSession("sans"), false);
  assert.equal(isEligibleForFreeSession("découverte"), false);
  assert.equal(isEligibleForFreeSession(""), false);
});

test("la normalisation des passeports ignore casse, espaces et accents", () => {
  assert.equal(normalizeSessionPassport("  DÉCOUVERTE "), "decouverte");
  assert.equal(normalizeSessionPassport(" Bleu "), "bleu");
});

test("React expose directement le statut et le passeport nécessaires à l'affichage", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");

  assert.match(app, /session-status-\$\{String\(session\.status \|\| "fermee"\)\.trim\(\)\.toLowerCase\(\)\}/);
  assert.match(app, /data-passport=\{normalizePassport\(p\.passport\)\}/);
});

test("les passeports incompatibles d'une séance libre sont hachurés sans script DOM", async () => {
  const css = await readFile(new URL("../src/styles/session-status-colors.css", import.meta.url), "utf8");
  const main = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");

  assert.match(css, /session-status-libre \.passport-row:not\(\[data-passport="jaune"\]\):not\(\[data-passport="orange"\]\):not\(\[data-passport="vert"\]\):not\(\[data-passport="bleu"\]\)/);
  assert.match(css, /repeating-linear-gradient/);
  assert.equal(main.includes("session-status-display.js"), false);
});

test("les couleurs de fond respectent la convention des inscriptions et restent prioritaires sur le thème", async () => {
  const css = await readFile(new URL("../src/styles/session-status-colors.css", import.meta.url), "utf8");
  const themeCss = await readFile(new URL("../src/styles/index.css", import.meta.url), "utf8");
  const main = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");

  assert.match(css, /session-status-libre[\s\S]*22, 163, 74[\s\S]*!important/); // vert
  assert.match(css, /session-status-encadree[\s\S]*37, 99, 235[\s\S]*!important/); // bleu
  assert.match(css, /session-status-fermee,[\s\S]*session-status-renouvellement[\s\S]*220, 38, 38[\s\S]*!important/); // rouge
  assert.match(css, /session-status-passeport[\s\S]*234, 88, 12[\s\S]*!important/); // orange
  assert.match(css, /session-status-challenge[\s\S]*100, 116, 139[\s\S]*!important/); // gris
  assert.match(themeCss, /\.toolbar,[\s\S]*\.card,[\s\S]*background:\s*var\(--theme-card-bg\)\s*!important/);
  assert.match(main, /styles\/session-status-colors\.css/);
});
