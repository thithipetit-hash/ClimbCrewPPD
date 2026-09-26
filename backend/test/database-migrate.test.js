import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { listMigrationFiles } from "../database/migrate.js";

const explicitRoutesUrl = new URL("../admin-users/explicit-routes.js", import.meta.url);
const databaseUrl = new URL("../admin-users/database.js", import.meta.url);
const legacyMigrationsUrl = new URL("../migrations/", import.meta.url);

test("un seul répertoire canonique conserve toutes les versions historiques dans l'ordre attendu", async () => {
  const migrations = await listMigrationFiles();
  const versions = migrations.map((migration) => migration.version);

  assert.deepEqual(versions.slice(0, 3), [
    "001_baseline.sql",
    "002_video_analysis.sql",
    "003_video_privacy_cleanup.sql",
  ]);
  assert.deepEqual(versions.slice(3), [
    "001_integrity_constraints.sql",
    "002_participant_initiator_qualifications.sql",
    "003_route_grade_scale.sql",
    "004_gmail_email_normalization.sql",
    "005_video_analysis.sql",
    "006_realisation_technical_analysis.sql",
    "007_runtime_schema_consolidation.sql",
    "008_video_upload_cleanup.sql",
    "009_realisations_grade_scale.sql",
    "010_participant_passeport_ffme.sql",
    "011_participant_physical_metrics.sql",
    "012_chat_messages.sql",
    "013_chat_attachments.sql",
    "014_chat_reactions.sql",
    "015_chat_social.sql",
    "016_buddy_availability.sql",
    "017_buddy_daily_session_preferences.sql",
    "018_chat_reply_schema_repair.sql",
    "021_realisation_kudos.sql",
    "022_chat_replies.sql",
  ]);
  assert.equal(new Set(versions).size, versions.length);
  assert.ok(migrations.every((migration) => migration.source === "database"));

  await assert.rejects(
    access(legacyMigrationsUrl, constants.F_OK),
    /ENOENT/,
  );
});

test("la migration 018 répare de façon idempotente le schéma des réponses du chat", async () => {
  const repair = await readFile(
    new URL("../database/migrations/018_chat_reply_schema_repair.sql", import.meta.url),
    "utf8",
  );
  assert.match(repair, /add column if not exists reply_to_id/i);
  assert.match(repair, /create index if not exists chat_messages_reply_to_idx/i);
});

test("la version historique 005 reste traçable mais ne rejoue plus le DDL de 002", async () => {
  const duplicate = await readFile(new URL("../database/migrations/005_video_analysis.sql", import.meta.url), "utf8");
  assert.match(duplicate, /Version historique conservée/);
  assert.match(duplicate, /select 1;/i);
  assert.doesNotMatch(duplicate, /alter\s+table|create\s+table/i);
});

test("les routes admin ne démarrent plus un second moteur ni du DDL hors migrations", async () => {
  const source = await readFile(explicitRoutesUrl, "utf8");
  const database = await readFile(databaseUrl, "utf8");

  assert.doesNotMatch(source, /migration-service\.js/);
  assert.doesNotMatch(source, /runDatabaseMigrations/);
  assert.doesNotMatch(source, /ensureAdminUserSchema/);
  assert.match(source, /export async function initializeAdminUserEnhancements\(\) \{\}/);
  assert.doesNotMatch(database, /\balter\s+table\b/i);
  assert.doesNotMatch(database, /\bcreate\s+table\b/i);
});
