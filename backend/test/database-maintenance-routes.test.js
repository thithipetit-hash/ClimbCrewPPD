import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [source, serverSource] = await Promise.all([
  readFile(new URL("../database-maintenance-routes.js", import.meta.url), "utf8"),
  readFile(new URL("../server.js", import.meta.url), "utf8"),
]);

test("setup-db reste protégé et applique les migrations puis initialise l'administrateur", () => {
  assert.match(source, /app\.get\("\/setup-db", requireSetupAccess, async/);
  assert.match(source, /const migrations = await runMigrations\(\)/);
  assert.match(source, /await ensureDefaultAdmin\(\)/);
  assert.match(source, /firstAdminEmailConfigured: Boolean\(firstAdminEmail\)/);
});

test("db-status reste protégé et expose l'état structurel et les migrations", () => {
  assert.match(source, /app\.get\("\/db-status", requireSetupAccess, async/);
  assert.match(source, /current_database\(\) as database/);
  assert.match(source, /to_regclass\('public\.participants'\)/);
  assert.match(source, /to_regclass\('public\.user_sessions'\)/);
  assert.match(source, /to_regclass\('public\.realisations'\)/);
  assert.match(source, /to_regclass\('public\.schema_migrations'\)/);
  assert.match(source, /getDatabaseMigrationStatus\(pool\)/);
});

test("server.js délègue les routes de maintenance au module dédié", () => {
  assert.match(serverSource, /installDatabaseMaintenanceRoutes\(app, \{/);
  assert.match(serverSource, /runMigrations: \(\) => runDatabaseMigrations\(pool\)/);
  assert.match(serverSource, /firstAdminEmail: config\.firstAdminEmail/);
  assert.equal(serverSource.includes('app.get("/setup-db", requireSetupAccess, async'), false);
  assert.equal(serverSource.includes('app.get("/db-status", requireSetupAccess, async'), false);
});
