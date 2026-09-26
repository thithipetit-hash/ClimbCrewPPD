import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("les principales écritures affichent une confirmation accessible", async () => {
  const sources = await Promise.all([
    "../src/App.jsx",
    "../src/hooks/useSessionPersistence.js",
    "../src/hooks/useRealisationPersistence.js",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  const source = sources.join("\n");

  for (const message of [
    "Séance enregistrée.",
    "Participant ajouté.",
    "Grimpeur supprimé.",
    "Voie ajoutée.",
    "Voie modifiée.",
    "Réalisation enregistrée.",
    "Réalisation supprimée.",
  ]) {
    assert.match(source, new RegExp(message.replace(".", "\\.")));
  }

  assert.match(source, /role="status"/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /role="alert"/);
  assert.match(source, /setTimeout\(\(\) => setConfirmationMessage\(""\), 3000\)/);
});
