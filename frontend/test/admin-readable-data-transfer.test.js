import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const profile = await readFile(new URL("../src/pages/Profil.jsx", import.meta.url), "utf8");
const administration = await readFile(new URL("../src/pages/Administration.jsx", import.meta.url), "utf8");

test("Voies du grimpeur est affiché après Réalisations", () => {
  assert.ok(profile.indexOf("<h3 style={{ margin: 0 }}>Réalisations</h3>") < profile.indexOf('title="Voies du grimpeur"'));
});

test("Administration expose un export et import JSON lisibles", () => {
  assert.match(administration, /apiFetch\("\/admin\/export-data"\)/);
  assert.match(administration, /apiFetch\("\/admin\/import-data"/);
  assert.match(administration, /JSON\.stringify\(data, null, 2\)/);
  assert.match(administration, /L’import remplace les données métier actuelles/);
  assert.match(administration, /<SaveFeedback status=\{dataTransferState\.status\}/);
});


test("Voies du grimpeur est replié par défaut et extensible au clic", () => {
  assert.match(profile, /title="Voies du grimpeur"[\s\S]*collapsible[\s\S]*defaultExpanded=\{false\}/);
});
