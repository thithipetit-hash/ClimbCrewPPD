import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { trustedClientIpMiddleware } from "../admin-users/client-ip-hardening.js";

const enhancementsSource = await readFile(new URL("../admin-user-enhancements.js", import.meta.url), "utf8");
const explicitRoutesSource = await readFile(new URL("../admin-users/explicit-routes.js", import.meta.url), "utf8");
const migrationServiceSource = await readFile(new URL("../admin-users/migration-service.js", import.meta.url), "utf8");
const databaseSource = await readFile(new URL("../admin-users/database.js", import.meta.url), "utf8");
const authMiddlewareSource = await readFile(new URL("../auth-middleware.js", import.meta.url), "utf8");
const migrationSql = await readFile(new URL("../migrations/001_integrity_constraints.sql", import.meta.url), "utf8");
const schemaSource = await readFile(new URL("../schema.sql", import.meta.url), "utf8");

test("l'adresse IP fiable remplace une chaîne X-Forwarded-For potentiellement falsifiée", () => {
  const req = {
    ip: "198.51.100.24",
    socket: { remoteAddress: "10.0.0.5" },
    headers: {
      "x-forwarded-for": "203.0.113.99, 198.51.100.24",
      "x-real-ip": "203.0.113.99",
    },
  };
  let nextCalled = false;
  trustedClientIpMiddleware(req, {}, () => { nextCalled = true; });
  assert.equal(req.headers["x-forwarded-for"], "198.51.100.24");
  assert.equal(req.headers["x-real-ip"], "198.51.100.24");
  assert.equal(nextCalled, true);
});

test("le durcissement IP est installé avant l'intégration des logs", () => {
  const hardeningIndex = enhancementsSource.indexOf("installClientIpHardening();");
  const logIndex = enhancementsSource.indexOf("installRateLimitLogIntegration();");
  assert.ok(hardeningIndex >= 0);
  assert.ok(logIndex >= 0);
  assert.ok(hardeningIndex < logIndex);
  assert.doesNotMatch(enhancementsSource, /installExpressIntegration/);
});

test("les migrations versionnées sont appliquées explicitement avant l'écoute réseau", () => {
  assert.match(migrationServiceSource, /create table if not exists schema_migrations/);
  assert.match(migrationServiceSource, /insert into schema_migrations \(version\)/);
  assert.doesNotMatch(migrationServiceSource, /express\.application\.listen/);
  assert.doesNotMatch(enhancementsSource, /installMigrationHook/);
  const migrationIndex = explicitRoutesSource.indexOf("await runDatabaseMigrations();");
  const adminSchemaIndex = explicitRoutesSource.indexOf("await ensureAdminUserSchema();");
  assert.ok(migrationIndex >= 0);
  assert.ok(adminSchemaIndex >= 0);
  assert.ok(migrationIndex < adminSchemaIndex);
});

test("le pool PostgreSQL est partagé explicitement sans monkey-patch de pg.Pool", () => {
  assert.doesNotMatch(databaseSource, /import pg from ["']pg["']/);
  assert.doesNotMatch(databaseSource, /pg\.Pool\s*=/);
  assert.doesNotMatch(databaseSource, /installPoolCapture/);
  assert.doesNotMatch(enhancementsSource, /installPoolCapture/);
  assert.match(databaseSource, /export function setPool\(pool\)/);
  assert.match(databaseSource, /let sharedPool = null/);
  assert.match(authMiddlewareSource, /import \{ setPool \} from "\.\/admin-users\/database\.js"/);
  assert.match(authMiddlewareSource, /setPool\(pool\);/);
});

test("la migration ajoute les relations structurantes sans bloquer un historique orphelin", () => {
  assert.match(migrationSql, /fk_realisations_session/);
  assert.match(migrationSql, /fk_realisations_route/);
  assert.match(migrationSql, /fk_session_participants_participant/);
  assert.match(migrationSql, /fk_sessions_encadrant/);
  assert.match(migrationSql, /fk_sessions_referent/);
  assert.match(migrationSql, /fk_realisations_participant/);
  assert.match(migrationSql, /fk_realisations_assureur/);
  assert.match(migrationSql, /not valid/i);
  assert.match(migrationSql, /alter column participant_id type bigint/i);
  assert.match(migrationSql, /raise warning/i);
});

test("schema.sql décrit désormais les identifiants participants comme des bigint reliés", () => {
  assert.match(schemaSource, /encadrant_id bigint references participants\(id\) on delete set null/);
  assert.match(schemaSource, /participant_id bigint not null references participants\(id\) on delete cascade/);
  assert.match(schemaSource, /assureur_id bigint references participants\(id\) on delete set null/);
  assert.match(schemaSource, /create table if not exists schema_migrations/);
});
