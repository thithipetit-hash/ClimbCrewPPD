import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { listMigrationFiles } from "../database/migrate.js";

const explicitRoutesUrl = new URL("../admin-users/explicit-routes.js", import.meta.url);
const databaseUrl = new URL("../admin-users/database.js", import.meta.url);

test("un seul moteur recense les deux répertoires historiques dans l'ordre attendu", async () => {
  const migrations = await listMigrationFiles();
  const versions = migrations.map((migration) => migration.version);

  assert.deepEqual(versions.slice(0, 3), [
    "001_baseline.sql",
    "002_video_analysis.sql",
    "003_video_privacy_cleanup.sql",
  ]);

  const firstLegacyIndex = versions.indexOf("001_integrity_constraints.sql");
  assert.ok(firstLegacyIndex >= 3);
  assert.ok(versions.includes("006_realisation_technical_analysis.sql"));
  assert.ok(versions.includes("007_runtime_schema_consolidation.sql"));
  assert.equal(new Set(versions).size, versions.length);

  assert.deepEqual(
    migrations.slice(0, 3).map((migration) => migration.source),
    ["database", "database", "database"],
  );
  assert.equal(migrations[firstLegacyIndex].source, "legacy-admin");
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
