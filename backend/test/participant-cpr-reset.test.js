import test from "node:test";
import assert from "node:assert/strict";
import { setPool } from "../admin-users/database.js";
import { recalculateOwnStatisticsAndCpr, resetOwnCpr } from "../admin-users/participant-cpr-reset-service.js";

function response() {
  return {
    code: 200,
    payload: null,
    status(code) { this.code = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

test("le reset porte uniquement sur le grimpeur de la session et ignore un identifiant falsifié", async () => {
  let params;
  setPool({
    query: async (sql, values) => {
      assert.match(sql, /where id = \$1/);
      params = values;
      return { rowCount: 1, rows: [{ cpr_reset_at: "2026-10-29T20:00:00Z" }] };
    },
  });
  const res = response();
  await resetOwnCpr({ auth: { user: { participantId: "42", role: "admin" } }, body: { participantId: "17" }, params: { id: "17" } }, res);
  assert.deepEqual(params, ["42"]);
  assert.equal(res.code, 200);
  assert.equal(res.payload.cprResetAt, "2026-10-29T20:00:00Z");
});

test("sans participant associé, même un administrateur ne peut pas réinitialiser le CPR d'autrui", async () => {
  const res = response();
  await resetOwnCpr({ auth: { user: { role: "admin" } }, body: { participantId: "42" } }, res);
  assert.equal(res.code, 409);
});

test("un identifiant malformé est refusé", async () => {
  const res = response();
  await resetOwnCpr({ auth: { user: { participantId: "42 OR 1=1" } } }, res);
  assert.equal(res.code, 409);
});

test("le recalcul réintègre les anciennes réalisations du seul compte connecté", async () => {
  let params;
  setPool({
    query: async (sql, values) => {
      assert.match(sql, /set cpr_reset_at = null where id = \$1/);
      params = values;
      return { rowCount: 1, rows: [{ cpr_reset_at: null }] };
    },
  });
  const res = response();
  await recalculateOwnStatisticsAndCpr({
    auth: { user: { participantId: "42", role: "admin" } },
    body: { participantId: "17" },
    params: { id: "17" },
  }, res);
  assert.deepEqual(params, ["42"]);
  assert.equal(res.code, 200);
  assert.deepEqual(res.payload, { ok: true, cprResetAt: null });
});

test("le recalcul refuse un compte non associé, même administrateur", async () => {
  const res = response();
  await recalculateOwnStatisticsAndCpr({ auth: { user: { role: "admin" } }, body: { participantId: "17" } }, res);
  assert.equal(res.code, 409);
});

test("le recalcul ne modifie rien si le grimpeur authentifié est introuvable", async () => {
  setPool({ query: async () => ({ rowCount: 0, rows: [] }) });
  const res = response();
  await recalculateOwnStatisticsAndCpr({ auth: { user: { participantId: "42" } } }, res);
  assert.equal(res.code, 404);
});
