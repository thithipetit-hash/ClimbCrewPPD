import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getPool } from "./database.js";

const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations/", import.meta.url));

async function ensureMigrationTable(client) {
  await client.query(`
    create table if not exists schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )
  `);
}

export async function listMigrationFiles() {
  const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /^\d+.*\.sql$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "en"));
}

/**
 * Applique chaque migration une seule fois, dans sa propre transaction.
 * PostgreSQL reste la source de vérité de l'état : aucun numéro de version
 * n'est conservé côté frontend ou dans une variable d'environnement.
 */
export async function runDatabaseMigrations() {
  const pool = getPool();
  const migrationFiles = await listMigrationFiles();
  const client = await pool.connect();

  try {
    await ensureMigrationTable(client);

    for (const version of migrationFiles) {
      const alreadyApplied = await client.query(
        `select 1 from schema_migrations where version = $1`,
        [version],
      );
      if (alreadyApplied.rowCount) continue;

      const sql = await readFile(path.join(MIGRATIONS_DIR, version), "utf8");
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query(
          `insert into schema_migrations (version) values ($1)`,
          [version],
        );
        await client.query("commit");
        console.log(`Migration PostgreSQL appliquée : ${version}`);
      } catch (error) {
        await client.query("rollback");
        throw new Error(`Migration ${version} impossible : ${error.message}`, { cause: error });
      }
    }
  } finally {
    client.release();
  }
}
