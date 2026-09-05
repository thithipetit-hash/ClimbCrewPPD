import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import test from "node:test";
import { runDatabaseMigrations } from "./migrate.js";

async function migrationFiles() {
  const entries = await readdir(new URL("./migrations/", import.meta.url), { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /^\d{3,}_[a-z0-9][a-z0-9_-]*\.sql$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
}

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

test("applique toutes les migrations absentes une seule fois et les trace", async () => {
  const expectedMigrations = await migrationFiles();
  const pool = createPool();
  const logger = { info() {}, error() {} };

  const result = await runDatabaseMigrations(pool, { logger });

  assert.deepEqual(result.executed, expectedMigrations);
  assert.equal(result.total, expectedMigrations.length);
  for (const version of expectedMigrations) {
    assert.ok(pool.appliedVersions.has(version), `${version} doit être tracée`);
  }
  assert.ok(pool.queries.some(({ text }) => text === "begin"));
  assert.ok(pool.queries.some(({ text }) => text === "commit"));
  assert.ok(pool.queries.some(({ text }) => text.includes("create table if not exists participants")));
});

test("n'exécute aucune migration lorsqu'elles sont toutes déjà enregistrées", async () => {
  const expectedMigrations = await migrationFiles();
  const pool = createPool({ applied: expectedMigrations });
  const logger = { info() {}, error() {} };

  const result = await runDatabaseMigrations(pool, { logger });

  assert.deepEqual(result.executed, []);
  assert.deepEqual(result.applied, expectedMigrations);
  assert.equal(pool.queries.some(({ text }) => text === "begin"), false);
});

test("sérialise les migrations avec un advisory lock PostgreSQL", async () => {
  const pool = createPool();
  const logger = { info() {}, error() {} };

  await runDatabaseMigrations(pool, { logger });

  const texts = pool.queries.map(({ text }) => text);
  const lockIndex = texts.indexOf("select pg_advisory_lock($1)");
  const schemaIndex = texts.findIndex((text) => text.includes("create table if not exists schema_migrations"));
  const beginIndex = texts.indexOf("begin");
  const commitIndex = texts.indexOf("commit");
  const unlockIndex = texts.indexOf("select pg_advisory_unlock($1)");

  assert.ok(lockIndex >= 0, "le verrou doit être acquis");
  assert.ok(schemaIndex > lockIndex, "la table de migrations doit être lue après verrouillage");
  assert.ok(beginIndex > schemaIndex, "la migration doit commencer après verrouillage");
  assert.ok(commitIndex > beginIndex, "la transaction doit être validée");
  assert.ok(unlockIndex > commitIndex, "le verrou doit être libéré après les migrations");
  assert.deepEqual(pool.queries[lockIndex].params, pool.queries[unlockIndex].params);
});