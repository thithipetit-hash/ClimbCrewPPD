import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { importLegacyData } from "../tools/import-legacy.mjs";

const serverSource = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8");
const cliSource = fs.readFileSync(new URL("../tools/import-legacy.mjs", import.meta.url), "utf8");
const packageJson = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("l'import legacy n'est plus exposé par le serveur HTTP", () => {
  assert.doesNotMatch(serverSource, /\/import-data/);
  assert.doesNotMatch(serverSource, /blockLegacyFileImportInProduction/);
});

test("l'import legacy reste disponible uniquement comme commande explicite", () => {
  assert.equal(packageJson.scripts["import:legacy"], "node tools/import-legacy.mjs");
  assert.match(cliSource, /--confirm=oui/);
  assert.match(cliSource, /allow-production/);
});

test("l'import vide reste transactionnel", async () => {
  const queries = [];
  let released = false;
  const client = {
    async query(sql) {
      queries.push(String(sql).trim().replace(/\s+/g, " "));
      return { rows: [] };
    },
    release() {
      released = true;
    },
  };
  const pool = {
    async connect() {
      return client;
    },
  };

  const result = await importLegacyData(pool, {});

  assert.equal(queries[0], "begin");
  assert.equal(queries.at(-1), "commit");
  assert.equal(released, true);
  assert.deepEqual(result, {
    participantsImported: 0,
    sessionsImported: 0,
    ropesImported: 0,
    routesImported: 0,
  });
});
