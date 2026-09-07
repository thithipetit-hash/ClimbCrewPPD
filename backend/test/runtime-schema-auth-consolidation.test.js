import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { installExpress4AsyncSafety } from "../middleware/http-stack.js";

const routeVideoSource = await readFile(new URL("../route-management-routes.js", import.meta.url), "utf8");
const realisationVideoSource = await readFile(new URL("../realisation-management-routes.js", import.meta.url), "utf8");
const databaseSource = await readFile(new URL("../admin-users/database.js", import.meta.url), "utf8");
const explicitRoutesSource = await readFile(new URL("../admin-users/explicit-routes.js", import.meta.url), "utf8");
const backupRoutesSource = await readFile(new URL("../backup-routes.js", import.meta.url), "utf8");
const migrationSource = await readFile(new URL("../migrations/007_runtime_schema_consolidation.sql", import.meta.url), "utf8");

test("le schéma admin et vidéo n'est plus créé dans les routes runtime", () => {
  for (const source of [routeVideoSource, realisationVideoSource, databaseSource]) {
    assert.doesNotMatch(source, /\balter\s+table\b/i);
    assert.doesNotMatch(source, /\bcreate\s+table\b/i);
    assert.doesNotMatch(source, /ensureVideoSchema/);
  }
  assert.doesNotMatch(databaseSource, /ensureAdminUserSchema/);

  assert.match(migrationSource, /alter table users add column if not exists is_admin/i);
  assert.match(migrationSource, /create table if not exists email_verification_tokens/i);
  assert.match(migrationSource, /create table if not exists route_video_upload_chunks/i);
  assert.match(migrationSource, /idx_route_videos_source_realisation/i);
});

test("les sauvegardes utilisent authentification puis autorisation canoniques", () => {
  assert.doesNotMatch(backupRoutesSource, /admin-users\/security\.js/);
  assert.match(backupRoutesSource, /installBackupRoutes\(app, \{ requireAuth, requireAdmin \}\)/);
  assert.match(explicitRoutesSource, /installBackupRoutes\(app, \{ requireAuth, requireAdmin \}\)/);
  assert.match(backupRoutesSource, /app\.get\("\/admin\/backups", requireAuth, requireAdmin/);
  assert.match(backupRoutesSource, /app\.post\("\/admin\/backups", requireAuth, requireAdmin/);
  assert.match(backupRoutesSource, /"\/admin\/backups\/import",\s*requireAuth,\s*requireAdmin,/);
});

test("la sécurité Express 4 transmet les rejets async à next", async () => {
  let registeredHandler = null;
  const app = {
    get(_path, handler) {
      registeredHandler = handler;
      return this;
    },
  };
  installExpress4AsyncSafety(app);

  const expected = new Error("boom");
  app.get("/test", async () => {
    throw expected;
  });

  assert.equal(typeof registeredHandler, "function");
  const forwarded = await new Promise((resolve) => {
    registeredHandler({}, {}, resolve);
  });
  assert.equal(forwarded, expected);
});
