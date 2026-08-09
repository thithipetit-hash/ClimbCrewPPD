import test from "node:test";
import assert from "node:assert/strict";
import { buildCsv, csvFileSlug } from "../src/csv-utils.js";

test("le CSV utilise UTF-8, le séparateur français et protège les cellules", () => {
  const csv = buildCsv(["Voie", "Commentaire"], [["L'échappée", 'Texte; avec "guillemets"'], ["=1+1", "ok"]]);

  assert.ok(csv.startsWith("\uFEFF"));
  assert.match(csv, /"Voie";"Commentaire"/);
  assert.match(csv, /"Texte; avec ""guillemets"""/);
  assert.match(csv, /"'=1\+1"/);
});

test("le nom du fichier est normalisé", () => {
  assert.equal(csvFileSlug("Élodie D'Arc"), "elodie-d-arc");
});
