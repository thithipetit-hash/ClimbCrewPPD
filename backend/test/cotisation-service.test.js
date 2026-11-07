import test from "node:test";
import assert from "node:assert/strict";
import { transferCotisationsToPreviousYear } from "../admin-users/cotisation-service.js";

test("le report conserve l'année courante en année précédente puis efface l'année courante", async () => {
  let query;
  const result = await transferCotisationsToPreviousYear({
    query: async (sql) => {
      query = sql;
      return { rowCount: 3, rows: [
        { cotisation_precedente: true },
        { cotisation_precedente: false },
        { cotisation_precedente: true },
      ] };
    },
  });
  assert.match(query, /cotisation_precedente = cotisation/);
  assert.match(query, /cotisation = false/);
  assert.match(query, /where exists \(select 1 from participants where cotisation = true\)/);
  assert.deepEqual(result, { affected: 3, transferred: 2 });
});

test("sans cotisations en cours, l'historique n'est pas écrasé", async () => {
  const result = await transferCotisationsToPreviousYear({
    query: async () => ({ rowCount: 0, rows: [] }),
  });
  assert.deepEqual(result, { affected: 0, transferred: 0 });
});
