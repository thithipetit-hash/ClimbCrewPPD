import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../src/pages/GestionComptes.jsx", import.meta.url),
  "utf8",
);

test("la gestion des comptes impose confirmation puis association manuelle", () => {
  assert.doesNotMatch(source, /\/admin\/auth\/associations\/auto/);
  assert.match(source, /user\.status === "pending" && !user\.email_verified_at/);
  assert.match(source, /Confirmez d’abord l’adresse e-mail/);
  assert.match(source, /confirmation de l’adresse e-mail, association manuelle à une fiche grimpeur, puis approbation/);
});
