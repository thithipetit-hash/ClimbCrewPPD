import test from "node:test";
import assert from "node:assert/strict";
import { listMigrationFiles, validateMigrationNumbering } from "./migrate.js";

test("l'historique consolidé reste accepté", async () => {
  const migrations = await listMigrationFiles();
  assert.ok(migrations.some((migration) => migration.version === "008_video_upload_cleanup.sql"));
});

test("les nouvelles migrations commencent à 009 et restent séquentielles", () => {
  assert.doesNotThrow(() => validateMigrationNumbering([
    "001_baseline.sql",
    "001_integrity_constraints.sql",
    "002_participant_initiator_qualifications.sql",
    "002_video_analysis.sql",
    "003_route_grade_scale.sql",
    "003_video_privacy_cleanup.sql",
    "004_gmail_email_normalization.sql",
    "005_video_analysis.sql",
    "006_realisation_technical_analysis.sql",
    "007_runtime_schema_consolidation.sql",
    "008_video_upload_cleanup.sql",
    "009_next_change.sql",
    "010_followup.sql",
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
