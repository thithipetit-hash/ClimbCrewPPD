import assert from "node:assert/strict";
import test from "node:test";
import { installRealisationManagementRoutes } from "../realisation-management-routes.js";

function createFixture() {
  const handlers = new Map();
  const app = {};
  for (const method of ["post", "put", "delete"]) {
    app[method] = (path, ...middleware) => {
      handlers.set(`${method.toUpperCase()} ${path}`, middleware.at(-1));
    };
  }

  const queries = [];
  const pool = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (sql.includes("select id from routes")) return { rowCount: 1, rows: [{ id: "v1" }] };
      if (sql.includes("select s.date, p.cotisation")) {
        return { rowCount: 1, rows: [{ date: "2026-10-29", cotisation: true }] };
      }
      if (sql.includes("from realisations") && sql.includes("select participant_id, session_id")) {
        const [, isAdmin, actorId] = params;
        const allowed = isAdmin || actorId === "33";
        return {
          rowCount: allowed ? 1 : 0,
          rows: allowed ? [{
            participant_id: "33", session_id: "s1", voie_id: "v1",
            date_realisation: "2026-10-29", chute: false, assureur_id: null,
            video_urls: [],
          }] : [],
        };
      }
      if (sql.includes("from participants p cross join routes r")) return {
        rowCount: 1, rows: [{ prenom: "Alice", nom: "Martin", nom_voie: "La voie" }],
      };
      if (sql.startsWith("delete from realisations")) {
        const [, isAdmin, actorId] = params;
        return { rowCount: (isAdmin || actorId === "33") ? 1 : 0, rows: [] };
      }
      return { rowCount: 1, rows: [] };
    },
  };

  installRealisationManagementRoutes(app, { requireAuth: (_req, _res, next) => next(), pool });
  async function request(method, path, role, participantId, body = {}) {
    const handler = handlers.get(`${method} ${path}`);
    assert.ok(handler, `Route ${method} ${path} indisponible`);
    const req = { auth: { user: { role, participantId } }, body, params: { id: "one" } };
    const res = {
      statusCode: 200, body: null,
      status(code) { this.statusCode = code; return this; },
      json(value) { this.body = value; return this; },
    };
    await handler(req, res);
    return res;
  }
  return { request, queries };
}

const draft = {
  id: "one", participantId: "33", sessionId: "s1", voieId: "v1",
  dateRealisation: "2026-10-29", styleRealisation: "a_vue",
  modeRealisation: "en_tete", chute: false, assureurId: "",
};

test("un administrateur crée une réalisation pour le participant sélectionné sans binôme", async () => {
  const fixture = createFixture();
  const response = await fixture.request("POST", "/realisations", "admin", "11", draft);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.participantId, "33");
  const insert = fixture.queries.find(({ sql }) => sql.includes("insert into realisations"));
  assert.equal(insert.params[1], "33");
  const chat = fixture.queries.find(({ sql }) => sql.includes("insert into chat_messages"));
  assert.equal(chat.params[0], "33");
});

test("un membre ne peut pas usurper l'identité du grimpeur lors de la création", async () => {
  const fixture = createFixture();
  const response = await fixture.request("POST", "/realisations", "user", "11", draft);
  assert.equal(response.statusCode, 200);
  const insert = fixture.queries.find(({ sql }) => sql.includes("insert into realisations"));
  assert.equal(insert.params[1], "11");
});

test("un vol sans assureur est rejeté même pour un administrateur", async () => {
  const fixture = createFixture();
  const response = await fixture.request("POST", "/realisations", "admin", "11", { ...draft, chute: true });
  assert.equal(response.statusCode, 400);
  assert.match(response.body.error, /obligatoire/);
  assert.equal(fixture.queries.some(({ sql }) => sql.includes("insert into realisations")), false);
});

test("un administrateur modifie une réalisation dont il n'est pas propriétaire", async () => {
  const fixture = createFixture();
  const response = await fixture.request("PUT", "/realisations/:id", "admin", "11", { commentaire: "Correction" });
  assert.equal(response.statusCode, 200);
  const update = fixture.queries.find(({ sql }) => sql.includes("update realisations"));
  assert.equal(update.params.at(-1), "33");
});

test("un membre ne peut ni modifier ni supprimer la réalisation d'un autre", async () => {
  const fixture = createFixture();
  const updated = await fixture.request("PUT", "/realisations/:id", "user", "11", { commentaire: "Interdit" });
  const deleted = await fixture.request("DELETE", "/realisations/:id", "user", "11");
  assert.equal(updated.statusCode, 403);
  assert.equal(deleted.statusCode, 403);
  assert.equal(fixture.queries.some(({ sql }) => sql.includes("update realisations")), false);
});

test("un administrateur peut supprimer une réalisation d'un participant", async () => {
  const fixture = createFixture();
  const response = await fixture.request("DELETE", "/realisations/:id", "admin", "11");
  assert.equal(response.statusCode, 200);
});
