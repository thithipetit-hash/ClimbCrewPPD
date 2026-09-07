import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { rejectMaintenanceTokenInQuery } from "../admin-users/maintenance-hardening.js";

const serverSource = await readFile(new URL("../server.js", import.meta.url), "utf8");
const routesSource = await readFile(
  new URL("../admin-users/explicit-routes.js", import.meta.url),
  "utf8",
);
const hardeningSource = await readFile(
  new URL("../admin-users/maintenance-hardening.js", import.meta.url),
  "utf8",
);
const legacyCliSource = await readFile(
  new URL("../tools/import-legacy.mjs", import.meta.url),
  "utf8",
);

function fakeResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

test("un jeton de maintenance dans l'URL est refusé", () => {
  const res = fakeResponse();
  let nextCalled = false;
  rejectMaintenanceTokenInQuery(
    { query: { setupToken: "secret" } },
    res,
    () => { nextCalled = true; },
  );

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 400);
  assert.match(res.payload.error, /X-Setup-Token/);
});

test("sans jeton dans l'URL, le contrôle d'accès historique continue", () => {
  const res = fakeResponse();
  let nextCalled = false;
  rejectMaintenanceTokenInQuery(
    { query: {} },
    res,
    () => { nextCalled = true; },
  );
  assert.equal(nextCalled, true);
});

test("setup-db et db-status refusent directement les jetons passés dans l'URL", () => {
  assert.match(serverSource, /if \(req\.query\.setupToken \|\| req\.query\.token\)/);
  assert.match(serverSource, /installDatabaseMaintenanceRoutes\(app, \{/);
  assert.match(serverSource, /requireSetupAccess,/);
});

test("l'import legacy destructif n'est plus exposé par HTTP", () => {
  assert.doesNotMatch(serverSource, /\/import-data/);
  assert.doesNotMatch(serverSource, /blockLegacyFileImportInProduction/);
  assert.doesNotMatch(hardeningSource, /blockLegacyFileImportInProduction/);
  assert.match(legacyCliSource, /--confirm=oui/);
  assert.match(legacyCliSource, /allow-production/);
});

test("le health check public ne renvoie aucun détail PostgreSQL", () => {
  assert.match(routesSource, /app\.get\("\/health", safeHealthCheck\)/);
  assert.match(hardeningSource, /status\(503\)\.json\(\{ ok: false, error: "Service temporairement indisponible" \}\)/);
  assert.doesNotMatch(hardeningSource, /json\(\{[^}]*String\(error\)/);
});
