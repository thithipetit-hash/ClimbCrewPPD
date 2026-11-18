import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { installChatRoutes } from "../chat-routes.js";

function createChatReactionHarness(pool) {
  let postReaction = null;
  let deleteReaction = null;
  const app = {
    get() {},
    patch() {},
    post(path, ...handlers) {
      if (path === "/chat/messages/:id/reactions") postReaction = handlers.at(-1);
    },
    delete(path, ...handlers) {
      if (path === "/chat/messages/:id/reactions") deleteReaction = handlers.at(-1);
    },
  };
  installChatRoutes(app, {
    requireAuth: (_req, _res, next) => next(),
    requireAdmin: (_req, _res, next) => next(),
    pool,
  });
  return { postReaction, deleteReaction };
}

function responseHarness() {
  return {
    statusCode: 200,
    body: null,
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  };
}

test("un Kudo donné dans le chat sur une réalisation est enregistré comme Kudo de réalisation", async () => {
  const queries = [];
  const pool = {
    async query(sql, params = []) {
      const text = String(sql).replace(/\s+/g, " ").trim();
      queries.push({ text, params });
      if (/from chat_messages where id = \$1 limit 1/i.test(text)) {
        return { rowCount: 1, rows: [{ kind: "system", eventType: "realisation", eventRef: "real-1" }] };
      }
      if (/select participant_id from realisations/i.test(text)) {
        return { rowCount: 1, rows: [{ participant_id: "99" }] };
      }
      if (/insert into realisation_kudos/i.test(text)) {
        return { rowCount: 1, rows: [] };
      }
      if (/select participant_id::text as "participantId"/i.test(text)) {
        return { rowCount: 1, rows: [{ participantId: "7" }] };
      }
      throw new Error(`Requête inattendue : ${text}`);
    },
  };

  const { postReaction } = createChatReactionHarness(pool);
  const res = responseHarness();
  await postReaction(
    {
      params: { id: "12" },
      body: { reaction: "👍" },
      auth: { user: { participantId: "7" } },
    },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.realisationId, "real-1");
  assert.deepEqual(res.body.kudosParticipantIds, ["7"]);
  assert.equal(queries.some(({ text }) => /insert into realisation_kudos/i.test(text)), true);
  assert.equal(queries.some(({ text }) => /insert into chat_message_reactions/i.test(text)), false);
});

test("retirer le Kudo depuis le chat retire le Kudo de la réalisation", async () => {
  const queries = [];
  const pool = {
    async query(sql, params = []) {
      const text = String(sql).replace(/\s+/g, " ").trim();
      queries.push({ text, params });
      if (/from chat_messages where id = \$1 limit 1/i.test(text)) {
        return { rowCount: 1, rows: [{ kind: "system", eventType: "realisation", eventRef: "real-1" }] };
      }
      if (/delete from realisation_kudos/i.test(text)) {
        return { rowCount: 1, rows: [] };
      }
      if (/select participant_id::text as "participantId"/i.test(text)) {
        return { rowCount: 0, rows: [] };
      }
      throw new Error(`Requête inattendue : ${text}`);
    },
  };

  const { deleteReaction } = createChatReactionHarness(pool);
  const res = responseHarness();
  await deleteReaction(
    {
      params: { id: "12" },
      body: { reaction: "👍" },
      auth: { user: { participantId: "7" } },
    },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.kudosCount, 0);
  assert.equal(queries.some(({ text }) => /delete from realisation_kudos/i.test(text)), true);
  assert.equal(queries.some(({ text }) => /delete from chat_message_reactions/i.test(text)), false);
});

test("le chat affiche les Kudos de réalisation depuis la source canonique", async () => {
  const source = await readFile(new URL("../chat-routes.js", import.meta.url), "utf8");
  assert.match(source, /from realisation_kudos k/);
  assert.match(source, /r\.reaction = '👍'[\s\S]*cm\.event_type = 'realisation'/);
});

test("la liste des réalisations expose les auteurs des Kudos", async () => {
  const source = await readFile(
    new URL("../admin-users/participant-privacy-service.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /as "kudosParticipantIds"/);
  assert.match(source, /order by k\.created_at asc, k\.participant_id asc/);
});

test("la migration reprend les anciens Kudos de réalisation du chat sans conserver de doublon", async () => {
  const migration = await readFile(
    new URL("../database/migrations/027_unify_realisation_chat_kudos.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /insert into realisation_kudos/i);
  assert.match(migration, /reaction\.reaction = '👍'/);
  assert.match(migration, /reaction\.participant_id::text <> realisation\.participant_id::text/);
  assert.match(migration, /delete from chat_message_reactions/i);
});
