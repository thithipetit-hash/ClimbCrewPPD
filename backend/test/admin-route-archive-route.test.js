import test from "node:test";
import assert from "node:assert/strict";

import { installAdminRouteArchiveRoute } from "../admin-route-archive-route.js";

function createFakeApp() {
  const registrations = [];
  return {
    registrations,
    get(path, ...handlers) { registrations.push({ method: "GET", path, handlers }); },
    post(path, ...handlers) { registrations.push({ method: "POST", path, handlers }); },
    put(path, ...handlers) { registrations.push({ method: "PUT", path, handlers }); },
  };
}

function registeredHandler(app, method, path) {
  const route = app.registrations.find((item) => item.method === method && item.path === path);
  assert.ok(route, `${method} ${path} doit être enregistré`);
  return route.handlers.at(-1);
}

test("l'archivage groupé journalise une seule fois le nombre de voies modifiées", async () => {
  const app = createFakeApp();
  const queries = [];
  const logs = [];
  const pool = {
    async query(sql) {
      queries.push(String(sql));
      return { rowCount: 7, rows: Array.from({ length: 7 }, (_, index) => ({ id: `route-${index + 1}` })) };
    },
  };
  const logAccess = async (entry) => logs.push(entry);

  installAdminRouteArchiveRoute(app, {
    requireAuth: (_req, _res, next) => next(),
    requireAdmin: (_req, _res, next) => next(),
    pool,
    logAccess,
  });

  const handler = registeredHandler(app, "PUT", "/routes/:id");
  let nextCount = 0;
  await handler(
    { body: { active: false }, auth: { user: { id: 42 } } },
    { status() { throw new Error("réponse HTTP inattendue"); } },
    () => { nextCount += 1; },
  );

  assert.equal(nextCount, 1);
  assert.equal(queries.length, 1);
  assert.match(queries[0], /where active is distinct from false/i);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].eventType, "routes_archived");
  assert.deepEqual(logs[0].details, { archivedCount: 7 });
});

test("une mise à jour classique d'une voie n'est pas transformée en archivage global", async () => {
  const app = createFakeApp();
  let queryCount = 0;
  installAdminRouteArchiveRoute(app, {
    requireAuth: (_req, _res, next) => next(),
    requireAdmin: (_req, _res, next) => next(),
    pool: { async query() { queryCount += 1; return { rowCount: 0, rows: [] }; } },
    logAccess: async () => {},
  });

  const handler = registeredHandler(app, "PUT", "/routes/:id");
  let nextCount = 0;
  await handler(
    { body: { nomVoie: "Nouvelle voie", active: false }, auth: { user: { id: 42 } } },
    {},
    () => { nextCount += 1; },
  );

  assert.equal(nextCount, 1);
  assert.equal(queryCount, 0);
});

test("la lecture des voies désactive le cache HTTP pour refléter immédiatement l'archivage", () => {
  const app = createFakeApp();
  installAdminRouteArchiveRoute(app, {
    requireAuth: (_req, _res, next) => next(),
    requireAdmin: (_req, _res, next) => next(),
    pool: { async query() { return { rowCount: 0, rows: [] }; } },
    logAccess: async () => {},
  });

  const handler = registeredHandler(app, "GET", "/routes");
  const headers = {};
  let nextCount = 0;
  handler({}, { set(name, value) { headers[name] = value; } }, () => { nextCount += 1; });

  assert.equal(headers["Cache-Control"], "no-store");
  assert.equal(nextCount, 1);
});
