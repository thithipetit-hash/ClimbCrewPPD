import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATION_FILE_PATTERN = /^\d{3,}_[a-z0-9][a-z0-9_-]*\.sql$/i;
const MIGRATION_LOCK_ID = 947_220_830;
const MIGRATION_DIRECTORY = fileURLToPath(new URL("./migrations/", import.meta.url));

// Ces trois versions appartenaient historiquement au premier répertoire de
// migrations et étaient exécutées avant toutes les migrations admin héritées.
// Les garder en tête préserve exactement l'ordre des bases neuves sans renommer
// les versions déjà enregistrées dans schema_migrations.
const EARLY_DATABASE_MIGRATIONS = [
  "001_baseline.sql",
  "002_video_analysis.sql",
  "003_video_privacy_cleanup.sql",
];
const EARLY_DATABASE_ORDER = new Map(
  EARLY_DATABASE_MIGRATIONS.map((version, index) => [version, index]),
);

function compareMigrationVersions(a, b) {
  const earlyA = EARLY_DATABASE_ORDER.get(a);
  const earlyB = EARLY_DATABASE_ORDER.get(b);
  if (earlyA !== undefined || earlyB !== undefined) {
    if (earlyA === undefined) return 1;
    if (earlyB === undefined) return -1;
    return earlyA - earlyB;
  }
  return a.localeCompare(b, "en", { numeric: true });
}

export async function listMigrationFiles() {
  const entries = await readdir(MIGRATION_DIRECTORY, { withFileTypes: true });
  const filenames = entries
    .filter((entry) => entry.isFile() && MIGRATION_FILE_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort(compareMigrationVersions);

  const versions = new Set();
  return filenames.map((version) => {
    if (versions.has(version)) {
      throw new Error(`Nom de migration PostgreSQL dupliqué : ${version}.`);
    }
    versions.add(version);
    return {
      version,
      source: "database",
      filePath: path.join(MIGRATION_DIRECTORY, version),
    };
  });
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
    const migrations = await listMigrationFiles();
    const files = migrations.map((migration) => migration.version);
    let appliedResult;
    try {
      appliedResult = await client.query(
        "select version, applied_at from schema_migrations order by version"
      );
    } catch (error) {
      // Un endpoint de statut doit rester en lecture seule. Sur une base encore
      // vierge, l'absence de schema_migrations signifie simplement tout pending.
      if (error?.code === "42P01") {
        return { total: files.length, applied: [], pending: files };
      }
      throw error;
    }
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
