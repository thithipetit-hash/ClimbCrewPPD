import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATION_FILE_PATTERN = /^\d{3,}_[a-z0-9][a-z0-9_-]*\.sql$/i;
const MIGRATION_LOCK_ID = 947_220_830;

// Deux répertoires de migrations existent historiquement. Ils sont désormais
// exécutés par un seul moteur, sous un seul verrou PostgreSQL et avec la même
// table schema_migrations. L'ordre conserve exactement le démarrage historique :
// migrations de la base principale, puis migrations des modules admin.
const MIGRATION_SOURCES = [
  {
    name: "database",
    directory: fileURLToPath(new URL("./migrations/", import.meta.url)),
  },
  {
    name: "legacy-admin",
    directory: fileURLToPath(new URL("../migrations/", import.meta.url)),
  },
];

export async function listMigrationFiles() {
  const migrations = [];
  const versions = new Set();

  for (const source of MIGRATION_SOURCES) {
    const entries = await readdir(source.directory, { withFileTypes: true });
    const filenames = entries
      .filter((entry) => entry.isFile() && MIGRATION_FILE_PATTERN.test(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));

    for (const version of filenames) {
      if (versions.has(version)) {
        throw new Error(
          `Nom de migration PostgreSQL dupliqué : ${version}. `
          + "Chaque migration doit avoir un nom unique, même entre les répertoires historiques.",
        );
      }
      versions.add(version);
      migrations.push({
        version,
        source: source.name,
        filePath: path.join(source.directory, version),
      });
    }
  }

  return migrations;
}

async function ensureMigrationTable(client) {
  await client.query(`
    create table if not exists schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )
  `);
}

async function acquireMigrationLock(client) {
  await client.query("select pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);
}

async function releaseMigrationLock(client) {
  await client.query("select pg_advisory_unlock($1)", [MIGRATION_LOCK_ID]);
}

export async function runDatabaseMigrations(pool, { logger = console } = {}) {
  const client = await pool.connect();
  let lockAcquired = false;

  try {
    await acquireMigrationLock(client);
    lockAcquired = true;
    await ensureMigrationTable(client);

    const appliedResult = await client.query(
      "select version from schema_migrations order by version"
    );
    const applied = new Set(appliedResult.rows.map((row) => String(row.version)));
    const migrations = await listMigrationFiles();
    const files = migrations.map((migration) => migration.version);
    const executed = [];

    for (const migration of migrations) {
      const { version, source, filePath } = migration;
      if (applied.has(version)) continue;

      const sql = await readFile(filePath, "utf8");
      if (!sql.trim()) {
        throw new Error(`Migration vide interdite : ${version}`);
      }

      await client.query("begin");
      try {
        await client.query(sql);
        await client.query(
          "insert into schema_migrations (version) values ($1)",
          [version]
        );
        await client.query("commit");
        executed.push(version);
        logger.info?.(`Migration appliquée : ${version} (${source})`);
      } catch (error) {
        await client.query("rollback");
        error.message = `Échec de la migration ${version}: ${error.message}`;
        throw error;
      }
    }

    return {
      applied: files.filter((filename) => applied.has(filename)),
      executed,
      pending: files.filter((filename) => !applied.has(filename) && !executed.includes(filename)),
      total: files.length,
    };
  } finally {
    if (lockAcquired) {
      try {
        await releaseMigrationLock(client);
      } catch (error) {
        logger.error?.("Impossible de libérer le verrou de migration PostgreSQL.", error);
      }
    }
    client.release();
  }
}

export async function getDatabaseMigrationStatus(pool) {
  const client = await pool.connect();
  try {
    await ensureMigrationTable(client);
    const migrations = await listMigrationFiles();
    const files = migrations.map((migration) => migration.version);
    const appliedResult = await client.query(
      "select version, applied_at from schema_migrations order by version"
    );
    const appliedByVersion = new Map(
      appliedResult.rows.map((row) => [String(row.version), row.applied_at])
    );

    return {
      total: files.length,
      applied: files
        .filter((filename) => appliedByVersion.has(filename))
        .map((filename) => ({ version: filename, appliedAt: appliedByVersion.get(filename) })),
      pending: files.filter((filename) => !appliedByVersion.has(filename)),
    };
  } finally {
    client.release();
  }
}
