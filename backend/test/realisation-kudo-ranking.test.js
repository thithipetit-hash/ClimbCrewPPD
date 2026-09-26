import test from "node:test";
import assert from "node:assert/strict";
import { installRealisationKudoRoutes } from "../realisation-kudo-routes.js";

function createRouteHarness(pool) {
  let statsHandler = null;
  const app = {
    get(path, _auth, handler) {
      if (path === "/realisations/kudos/stats") statsHandler = handler;
    },
    post() {},
    delete() {},
  };
  installRealisationKudoRoutes(app, { requireAuth: (_req, _res, next) => next(), pool });
  return statsHandler;
}

test("le classement Kudos agrège les dons et les réceptions par grimpeur", async () => {
  const queries = [];
  const pool = {
    async query(sql) {
      queries.push(String(sql));
      return {
        rows: [
          { participantId: "1", givenCount: 4, receivedCount: 7 },
          { participantId: "2", givenCount: 1, receivedCount: 0 },
        ],
      };
    },
  };
  const handler = createRouteHarness(pool);
  let body = null;
  const res = {
    json(value) {
      body = value;
      return this;
    },
    status() {
      return this;
    },
  };

  await handler({}, res);

  assert.deepEqual(body, [
    { participantId: "1", givenCount: 4, receivedCount: 7 },
    { participantId: "2", givenCount: 1, receivedCount: 0 },
  ]);
  assert.match(queries[0], /from realisation_kudos/i);
  assert.match(queries[0], /join realisations/i);
  assert.match(queries[0], /givenCount/);
  assert.match(queries[0], /receivedCount/);
});
