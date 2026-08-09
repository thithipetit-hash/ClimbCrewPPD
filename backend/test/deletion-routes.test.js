import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("les suppressions administratives sont protégées et transactionnelles", async () => {
  const source = await readFile(new URL("../server.js", import.meta.url), "utf8");

  assert.match(source, /app\.delete\("\/routes\/:id", requireAuth, requireAdmin/);
  assert.match(source, /app\.delete\("\/participants\/:id", requireAuth, requireAdmin/);
  assert.match(source, /app\.delete\("\/admin\/auth\/users\/:id", requireAuth, requireAdmin/);
  assert.match(source, /Vous ne pouvez pas supprimer votre propre compte/);
  assert.match(source, /Le dernier compte administrateur actif ne peut pas être supprimé/);
  assert.match(source, /delete from realisations where voie_id = \$1/);
  assert.match(source, /delete from realisations where participant_id = \$1/);
  assert.match(source, /await client\.query\("rollback"\)/);
});
