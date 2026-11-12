import test from "node:test";
import assert from "node:assert/strict";

import { installRouteCoreRoutes } from "../route-core-routes.js";

function createFakeApp() {
  const registrations = [];
  return {
    registrations,
    get(path, ...handlers) { registrations.push({ method: "GET", path, handlers }); },
    post(path, ...handlers) { registrations.push({ method: "POST", path, handlers }); },
    put(path, ...handlers) { registrations.push({ method: "PUT", path, handlers }); },
    delete(path, ...handlers) { registrations.push({ method: "DELETE", path, handlers }); },
  };
}

function registeredHandler(app, method, path) {
  const route = app.registrations.find((item) => item.method === method && item.path === path);
  assert.ok(route, `${method} ${path} doit être enregistré`);
  return route.handlers.at(-1);
}

test("PUT /routes/:id avec active=false ne modifie que la voie ciblée", async () => {
  const app = createFakeApp();
  const queries = [];
  const pool = {
    async query(sql, params) {
      queries.push({ sql: String(sql), params });
      return {
        rowCount: 1,
        rows: [{
          id: "route-2",
          numero_voie_unique: "2",
          numero_corde: 2,
          couleur_prises: "bleu",
          cotation_reference: "6a",
          cotation_ajustee: "6a",
          nom_voie: "Test",
          nom_ouvreur: "Ouvreur",
          moulinette_only: false,
          tags: [],
          video_urls: [],
          active: false,
          date_creation: "2026-10-10",
        }],
      };
    },
  };

  installRouteCoreRoutes(app, {
    requireAuth: (_req, _res, next) => next(),
    requireAdmin: (_req, _res, next) => next(),
    pool,
  });

  const handler = registeredHandler(app, "PUT", "/routes/:id");
  let responseBody = null;
  await handler(
    { params: { id: "route-2" }, body: { active: false } },
    {
      json(value) { responseBody = value; },
      status() { throw new Error("statut HTTP inattendu"); },
    },
  );

  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /where id = \$1 returning \*/i);
  assert.equal(queries[0].params[0], "route-2");
  assert.equal(queries[0].params[9], false);
  assert.equal(responseBody.id, "route-2");
  assert.equal(responseBody.active, false);
});
