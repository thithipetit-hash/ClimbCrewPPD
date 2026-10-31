import test from "node:test";
import assert from "node:assert/strict";

import { installChatRoutes } from "../chat-routes.js";

function createHarness(pool) {
  const routes = new Map();
  const app = {
    get() {},
    delete() {},
    patch() {},
    post(path, ...handlers) {
      routes.set(path, handlers);
    },
  };
  const requireAuth = (_req, _res, next) => next();
  const requireAdmin = (_req, _res, next) => next();
  installChatRoutes(app, { requireAuth, requireAdmin, pool });
  return { routes, requireAuth, requireAdmin };
}

function responseHarness() {
  return {
    statusCode: 200,
    body: null,
    status(value) {
      this.statusCode = value;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };
}

test("l'épinglage global est protégé par requireAdmin", () => {
  const { routes, requireAdmin } = createHarness({ query: async () => ({ rows: [] }) });
  const handlers = routes.get("/chat/messages/:id/pin");
  assert.ok(handlers);
  assert.equal(handlers.length, 3);
  assert.equal(handlers[1], requireAdmin);
});

test("un vote verrouille le sondage avant modification puis commit", async () => {
  const queries = [];
  const client = {
    async query(sql, params) {
      queries.push({ sql: String(sql), params });
      if (/select poll/i.test(sql)) {
        return {
          rows: [{
            poll: {
              question: "On grimpe ?",
              options: [
                { id: 1, label: "Oui", votes: ["7"] },
                { id: 2, label: "Non", votes: [] },
              ],
            },
          }],
        };
      }
      return { rows: [], rowCount: 1 };
    },
    release() {
      queries.push({ sql: "release" });
    },
  };
  const pool = { async connect() { return client; }, async query() { return { rows: [] }; } };
  const { routes } = createHarness(pool);
  const handler = routes.get("/chat/messages/:id/poll-vote").at(-1);
  const res = responseHarness();

  await handler({
    params: { id: "10" },
    body: { optionId: 2 },
    auth: { user: { participantId: "42" } },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.match(queries[1].sql, /for update/i);
  assert.ok(queries.some(({ sql }) => /^commit$/i.test(sql)));
  assert.equal(res.body.poll.options[0].votes.includes("42"), false);
  assert.equal(res.body.poll.options[1].votes.includes("42"), true);
});

test("une option de sondage inconnue est refusée et la transaction est annulée", async () => {
  const queries = [];
  const client = {
    async query(sql) {
      queries.push(String(sql));
      if (/select poll/i.test(sql)) {
        return { rows: [{ poll: { options: [{ id: 1, label: "Oui", votes: [] }] } }] };
      }
      return { rows: [] };
    },
    release() {},
  };
  const pool = { async connect() { return client; }, async query() { return { rows: [] }; } };
  const { routes } = createHarness(pool);
  const handler = routes.get("/chat/messages/:id/poll-vote").at(-1);
  const res = responseHarness();

  await handler({
    params: { id: "10" },
    body: { optionId: 9 },
    auth: { user: { participantId: "42" } },
  }, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /option/i);
  assert.ok(queries.some((sql) => /^rollback$/i.test(sql)));
});
