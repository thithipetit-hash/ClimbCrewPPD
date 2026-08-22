import { getPool } from "./database.js";

const DEFAULT_RETENTION_DAYS = 90;
const DEFAULT_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;
let timer = null;

export function getAccessLogRetentionDays(value = process.env.ACCESS_LOG_RETENTION_DAYS) {
  const parsed = Number(value || DEFAULT_RETENTION_DAYS);
  if (!Number.isInteger(parsed) || parsed < 7 || parsed > 730) return DEFAULT_RETENTION_DAYS;
  return parsed;
}

/** Supprime les journaux techniques plus anciens que la durée de conservation. */
export async function purgeExpiredAccessLogs({
  retentionDays = getAccessLogRetentionDays(),
  pool = getPool(),
} = {}) {
  const result = await pool.query(
    `delete from access_logs where created_at < now() - ($1::integer * interval '1 day')`,
    [retentionDays],
  );
  return { retentionDays, deleted: result.rowCount || 0 };
}

/**
 * Lance une purge au démarrage puis une fois par jour.
 * Le timer est détaché afin de ne pas empêcher l'arrêt propre du processus.
 */
export async function startAccessLogRetentionScheduler() {
  if (timer) return;

  try {
    const result = await purgeExpiredAccessLogs();
    if (result.deleted > 0) {
      console.log(`Journaux d’accès purgés : ${result.deleted} entrée(s), rétention ${result.retentionDays} jours.`);
    }
  } catch (error) {
    console.error("Purge initiale des journaux d’accès impossible :", error);
  }

  timer = setInterval(async () => {
    try {
      await purgeExpiredAccessLogs();
    } catch (error) {
      console.error("Purge périodique des journaux d’accès impossible :", error);
    }
  }, DEFAULT_SWEEP_INTERVAL_MS);
  timer.unref?.();
}
