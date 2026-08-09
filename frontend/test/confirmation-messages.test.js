import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("les principales écritures affichent une confirmation accessible", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");

  for (const message of [
    "Séance enregistrée.",
    "Participant ajouté.",
    "Participant supprimé.",
    "Voie ajoutée.",
    "Voie modifiée.",
    "Réalisation enregistrée.",
    "Réalisation supprimée.",
  ]) {
    assert.match(source, new RegExp(message.replace(".", "\\.")));
  }

  assert.match(source, /role="status"/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /setTimeout\(\(\) => setConfirmationMessage\(""), 3000\)/);
});
