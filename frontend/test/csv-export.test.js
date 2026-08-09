import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

test("l'export des réalisations utilise les colonnes attendues par theCrag", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");

  assert.match(source, /\["country", "crag", "sector", "route", "grade", "date", "style", "comment"\]/);
  assert.match(source, /"France"/);
  assert.match(source, /"ASTC"/);
  assert.match(source, /Exporter pour theCrag/);
});
