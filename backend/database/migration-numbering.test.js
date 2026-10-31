import test from "node:test";
import assert from "node:assert/strict";
import { listMigrationFiles, validateMigrationNumbering } from "./migrate.js";

test("l'historique consolidé reste accepté", async () => {
  const migrations = await listMigrationFiles();
  assert.ok(migrations.some((migration) => migration.version === "008_video_upload_cleanup.sql"));
  assert.ok(migrations.some((migration) => migration.version === "021_realisation_kudos.sql"));
  assert.ok(migrations.some((migration) => migration.version === "022_chat_replies.sql"));
});

test("la séquence 009 à 018 reste continue", () => {
  assert.doesNotThrow(() => validateMigrationNumbering([
    "009_a.sql", "010_b.sql", "011_c.sql", "012_d.sql", "013_e.sql",
    "014_f.sql", "015_g.sql", "016_h.sql", "017_i.sql", "018_j.sql",
  ]));

  assert.throws(
    () => validateMigrationNumbering(["009_first.sql", "009_duplicate.sql"]),
    /dupliqué/i,
  );
  assert.throws(
    () => validateMigrationNumbering(["010_skips_009.sql"]),
    /009 attendu/i,
  );
  assert.throws(
    () => validateMigrationNumbering(["004_new_history_rewrite.sql"]),
    /009/i,
  );
});

test("après le saut historique 021-022, la prochaine migration est 023", () => {
  assert.doesNotThrow(() => validateMigrationNumbering([
    "023_next.sql",
    "024_followup.sql",
  ]));

  assert.throws(
    () => validateMigrationNumbering(["019_wrong.sql"]),
    /023/i,
  );
  assert.throws(
    () => validateMigrationNumbering(["020_wrong.sql"]),
    /023/i,
  );
  assert.throws(
    () => validateMigrationNumbering(["024_skips_023.sql"]),
    /023 attendu/i,
  );
});
