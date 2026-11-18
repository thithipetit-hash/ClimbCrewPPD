import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Progression permet d'afficher les grimpeurs ayant donné un Kudo", async () => {
  const source = await readFile(new URL("../src/pages/Progression.jsx", import.meta.url), "utf8");
  assert.match(source, /kudosParticipantIds/);
  assert.match(source, /Voir qui a donné un Kudo/);
  assert.match(source, /Kudos donnés par/);
});
