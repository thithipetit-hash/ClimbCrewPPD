import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  blockLegacyFileImportInProduction,
  rejectMaintenanceTokenInQuery,
} from "../admin-users/maintenance-hardening.js";

const serverSource = await readFile(new URL("../server.js", import.meta.url), "utf8");
const routesSource = await readFile(
  new URL("../admin-users/explicit-routes.js", import.meta.url),
  "utf8",
);
const hardeningSource = await readFile(
  new URL("../admin-users/maintenance-hardening.js", import.meta.url),
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

test("l'import fichier legacy est désactivé par défaut en production", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousAllow = process.env.ALLOW_LEGACY_FILE_IMPORT;
  process.env.NODE_ENV = "production";
  delete process.env.ALLOW_LEGACY_FILE_IMPORT;

  try {
    const res = fakeResponse();
    let nextCalled = false;
    blockLegacyFileImportInProduction({}, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 404);
    assert.match(res.payload.error, /désactivée en production/);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousAllow === undefined) delete process.env.ALLOW_LEGACY_FILE_IMPORT;
    else process.env.ALLOW_LEGACY_FILE_IMPORT = previousAllow;
  }
});

test("la route d'import legacy reçoit explicitement le garde-fou de production avant son contrôleur", () => {
  assert.match(
    serverSource,
    /app\.post\("\/import-data", blockLegacyFileImportInProduction, requireSetupAccess, async/,
  );
});

test("le health check public ne renvoie aucun détail PostgreSQL", () => {
  assert.match(routesSource, /app\.get\("\/health", safeHealthCheck\)/);
  assert.match(hardeningSource, /status\(503\)\.json\(\{ ok: false, error: "Service temporairement indisponible" \}\)/);
  assert.doesNotMatch(hardeningSource, /json\(\{[^}]*String\(error\)/);
});
