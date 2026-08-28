import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const serverSource = await readFile(new URL("../server.js", import.meta.url), "utf8");
const preloadSource = await readFile(new URL("../admin-user-enhancements.js", import.meta.url), "utf8");
const routesSource = await readFile(new URL("../admin-users/explicit-routes.js", import.meta.url), "utf8");

test("le préchargement ne surcharge plus les méthodes de routage Express", () => {
  assert.doesNotMatch(preloadSource, /installExpressIntegration/);
  assert.doesNotMatch(preloadSource, /express\.application\.(?:get|post|put|patch|delete|listen)\s*=/);
});

test("server.js installe explicitement les contrôleurs modernes", () => {
  assert.match(serverSource, /installExplicitAdminUserRoutes\(app/);
  assert.match(serverSource, /app\.use\(createCrossOriginCsrfBridge\(\)\)/);
  assert.doesNotMatch(serverSource, /legacyReplacedRoute/);
});

test("les routes critiques sont visibles dans un module de routage standard", () => {
  for (const route of [
    "/auth/login",
    "/participants",
    "/participants/me/profile",
    "/realisations",
    "/sessions/:id",
    "/admin/import-data",
    "/admin/export-data",
  ]) {
    assert.ok(routesSource.includes(`\"${route}\"`), `route absente : ${route}`);
  }
});

test("les jetons de maintenance ne sont plus lus depuis la query string", () => {
  assert.match(serverSource, /if \(req\.query\.setupToken \|\| req\.query\.token\)/);
  assert.match(serverSource, /const providedToken = req\.headers\["x-setup-token"\]/);
  assert.doesNotMatch(serverSource, /req\.headers\["x-setup-token"\] \|\| req\.query/);
});
