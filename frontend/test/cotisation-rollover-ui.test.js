import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../src/pages/DonneesUtilisateurs.jsx", import.meta.url), "utf8");
const fields = readFileSync(new URL("../src/lib/user-data-management.js", import.meta.url), "utf8");

test("les deux années de cotisation sont visibles et modifiables dans les données utilisateurs", () => {
  assert.match(fields, /\["cotisation", "Cotisation année en cours"\]/);
  assert.match(fields, /\["cotisationPrecedente", "Cotisation année précédente"\]/);
  assert.match(fields, /cotisationPrecedente: Boolean\(draft.cotisationPrecedente\)/);
});

test("le report passe par le reset admin sécurisé avec confirmation et recharge", () => {
  assert.match(page, /window.confirm\(/);
  assert.match(page, /\/admin\/reset\/cotisations/);
  assert.match(page, /RESET_COTISATIONS/);
  assert.match(page, /await onSaved\(\)/);
  assert.match(page, /disabled=\{savingAll \|\| resettingCotisations/);
});
