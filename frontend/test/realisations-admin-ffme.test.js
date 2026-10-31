import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { displayUserDataValue, USER_DATA_COLUMNS } from "../src/lib/user-data-management.js";
import { getFfmeAgeCategory, getFfmeSeasonYear } from "../../shared/ffme-age-categories.js";

test("la nouvelle réalisation exige un binôme uniquement en cas de vol", async () => {
  const modal = await readFile(new URL("../src/components/RealisationModal.jsx", import.meta.url), "utf8");
  assert.match(modal, /newRealisation\.chute && !newRealisation\.assureurId/);
  assert.match(modal, /required=\{Boolean\(newRealisation\.chute\)\}/);
  assert.match(modal, /isAdmin && \(/);
  assert.match(modal, /<label>Grimpeur<\/label>/);
});

test("la progression permet à un administrateur de créer et modifier pour autrui", async () => {
  const [app, progression, persistence] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/Progression.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/hooks/useRealisationPersistence.js", import.meta.url), "utf8"),
  ]);
  assert.match(app, /authUser\?\.role === "admin"/);
  assert.match(app, /participantId: String\(newRealisation\.participantId\)/);
  assert.match(progression, /canEditRealisation = isAdmin \|\|/);
  assert.match(persistence, /authUser\?\.role !== "admin"/);
});

test("la catégorie est dérivée de la naissance sans donnée persistée redondante", () => {
  const birthYear = getFfmeSeasonYear() - 42;
  const participant = { anneeNaissance: String(birthYear) };
  assert.equal(displayUserDataValue(participant, "categorieFfme"), "Vétéran 1");
  assert.equal(displayUserDataValue({ anneeNaissance: null }, "categorieFfme"), "Non renseignée");
  assert.equal(getFfmeAgeCategory(birthYear, getFfmeSeasonYear()), "Vétéran 1");
  assert.ok(USER_DATA_COLUMNS.some(([key]) => key === "anneeNaissance"));
  assert.ok(USER_DATA_COLUMNS.some(([key]) => key === "categorieFfme"));
});
