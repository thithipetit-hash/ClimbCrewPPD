import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("l'interface confirme les suppressions définitives", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");

  assert.match(source, /Supprimer définitivement le grimpeur/);
  assert.match(source, /Supprimer définitivement la voie/);
  assert.match(source, /Supprimer définitivement le compte/);
  assert.match(source, /Supprimer la voie<\/button>/);
  assert.match(source, /Supprimer le compte<\/button>/);
  assert.match(source, /Voie supprimée\./);
  assert.match(source, /Compte supprimé\./);
  assert.match(source, /Grimpeur supprimé\./);
});
