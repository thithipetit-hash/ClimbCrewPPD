import assert from "node:assert/strict";
import test from "node:test";
import { runDatabaseMigrations } from "./migrate.js";

function createPool({ applied = [] } = {}) {
  const queries = [];
  const appliedVersions = new Set(applied);

  const client = {
    async query(sql, params = []) {
      const text = String(sql).trim();
      queries.push({ text, params });

      if (text.startsWith("select version from schema_migrations")) {
        return { rows: [...appliedVersions].map((version) => ({ version })) };
      }

      if (text.startsWith("insert into schema_migrations")) {
        appliedVersions.add(String(params[0]));
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    },
    release() {},
  };

  return {
    queries,
    appliedVersions,
    async connect() {
      return client;
    },
  };
}

test("applique la migration baseline une seule fois et la trace", async () => {
  const pool = createPool();
  const logger = { info() {} };

  const result = await runDatabaseMigrations(pool, { logger });

  assert.deepEqual(result.executed, ["001_baseline.sql"]);
  assert.equal(result.total, 1);
  assert.ok(pool.appliedVersions.has("001_baseline.sql"));
  assert.ok(pool.queries.some(({ text }) => text === "begin"));
  assert.ok(pool.queries.some(({ text }) => text === "commit"));
  assert.ok(pool.queries.some(({ text }) => text.includes("create table if not exists participants")));
});

test("n'exécute pas une migration déjà enregistrée", async () => {
  const pool = createPool({ applied: ["001_baseline.sql"] });
  const logger = { info() {} };

  const result = await runDatabaseMigrations(pool, { logger });

  assert.deepEqual(result.executed, []);
  assert.deepEqual(result.applied, ["001_baseline.sql"]);
  assert.equal(pool.queries.some(({ text }) => text === "begin"), false);
});
