import test from "node:test";
import assert from "node:assert/strict";

import { installRealisationKudoRoutes } from "../realisation-kudo-routes.js";

test("un grimpeur ne peut pas donner un Kudo à sa propre réalisation", async () => {
  let postHandler = null;
  let queryCount = 0;
  const app = {
    get() {},
    delete() {},
    post(path, _auth, handler) {
      if (path === "/realisations/:id/kudos") postHandler = handler;
    },
  };
  const pool = {
    async query(sql) {
      queryCount += 1;
      if (/select participant_id from realisations/i.test(String(sql))) {
        return { rowCount: 1, rows: [{ participant_id: "42" }] };
      }
      throw new Error("Aucune écriture de Kudo ne doit être exécutée");
    },
  };
  installRealisationKudoRoutes(app, {
    requireAuth: (_req, _res, next) => next(),
    pool,
  });

  const res = {
    statusCode: 200,
    body: null,
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  };

  await postHandler(
    { params: { id: "r1" }, auth: { user: { participantId: "42" } } },
    res,
  );

  assert.equal(res.statusCode, 409);
  assert.match(res.body.error, /propre réalisation/i);
  assert.equal(queryCount, 1);
});
