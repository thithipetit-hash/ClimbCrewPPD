import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { getPool } from "./admin-users/database.js";
import { sendBackupEmail } from "./admin-users/email-service.js";
import { markSchedulerDegraded, markSchedulerDisabled, markSchedulerHealthy } from "./scheduler-health.js";

const execFileAsync = promisify(execFile);

function envBoolean(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "oui", "on"].includes(String(value).trim().toLowerCase());
}

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
const BACKUP_ENABLED = envBoolean("BACKUP_ENABLED", false);
const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR || "/backups");
const BACKUP_TIMEZONE = String(process.env.BACKUP_TIMEZONE || "Europe/Paris").trim();
const BACKUP_HOUR = Math.min(23, Math.max(0, Number(process.env.BACKUP_HOUR || 3)));
const BACKUP_RECIPIENT = String(process.env.BACKUP_RECIPIENT || "").trim().toLowerCase();
const BACKUP_RETENTION_DAYS = Math.max(7, Number(process.env.BACKUP_RETENTION_DAYS || 35));
const BACKUP_UPLOAD_MAX_BYTES = Math.max(1024 * 1024, Number(process.env.BACKUP_UPLOAD_MAX_BYTES || 50 * 1024 * 1024));
const BACKUP_SCHEDULER_FLAG = Symbol.for("climbcrew.backupScheduler.started");
const EMAIL_RETRY_MS = 60 * 60 * 1000;

let operationQueue = Promise.resolve();
const lastEmailAttemptByFile = new Map();

function assertBackupEnabled() {
  if (!BACKUP_ENABLED) throw new Error("Le service de sauvegarde n'est pas activé sur cet environnement");
}

function assertBackupRecipientConfigured() {
  if (!BACKUP_RECIPIENT) {
    throw new Error("BACKUP_RECIPIENT n'est pas configuré : la sauvegarde locale est conservée mais aucun e-mail ne peut être envoyé");
  }
}

function queueOperation(operation) {
  const next = operationQueue.then(operation, operation);
  operationQueue = next.catch(() => undefined);
  return next;
}

function localParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: BACKUP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    stamp: `${parts.year}-${parts.month}-${parts.day}-${parts.hour}${parts.minute}${parts.second}`,
  };
}

function safeReason(value = "manual") {
  return String(value || "manual")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "manual";
}

export function isSafeBackupFilename(fileName) {
  return /^climbcrew-[a-z0-9-]+-\d{4}-\d{2}-\d{2}-\d{6}\.dump$/.test(String(fileName || ""));
}

export function buildBackupFilename(reason = "manual", date = new Date()) {
  const local = localParts(date);
  return `climbcrew-${safeReason(reason)}-${local.stamp}.dump`;
}

function scheduledFilename(dateString) {
  return `climbcrew-scheduled-${dateString}-${String(BACKUP_HOUR).padStart(2, "0")}0000.dump`;
}

function backupPath(fileName) {
  if (!isSafeBackupFilename(fileName)) {
    throw new Error("Nom de sauvegarde invalide");
  }
  const resolved = path.resolve(BACKUP_DIR, fileName);
  if (path.dirname(resolved) !== BACKUP_DIR) {
    throw new Error("Chemin de sauvegarde invalide");
  }
  return resolved;
}

function mailMarkerPath(fileName) {
  return `${backupPath(fileName)}.mailed`;
}

async function ensureBackupDirectory() {
  assertBackupEnabled();
  await fs.mkdir(BACKUP_DIR, { recursive: true });
}

async function runPgTool(command, args, options = {}) {
  assertBackupEnabled();
  if (!DATABASE_URL) throw new Error("DATABASE_URL est absent");
  return execFileAsync(command, args, {
    maxBuffer: 10 * 1024 * 1024,
    timeout: options.timeout || 10 * 60 * 1000,
    env: process.env,
  });
}

async function validateDumpFile(filePath) {
  const stats = await fs.stat(filePath);
  if (!stats.isFile() || stats.size < 1024) {
    throw new Error("Le fichier de sauvegarde est vide ou incomplet");
  }
  await runPgTool("pg_restore", ["--list", filePath], { timeout: 2 * 60 * 1000 });
  return stats;
}

async function createBackupInternal({ reason = "manual", fixedFileName = "" } = {}) {
  await ensureBackupDirectory();
  const fileName = fixedFileName || buildBackupFilename(reason);
  const finalPath = backupPath(fileName);
  const temporaryPath = `${finalPath}.tmp`;

  await fs.rm(temporaryPath, { force: true });
  try {
    await runPgTool("pg_dump", [
      "--format=custom",
      "--no-owner",
      "--no-privileges",
      "--file",
      temporaryPath,
      "--dbname",
      DATABASE_URL,
    ]);
    const stats = await validateDumpFile(temporaryPath);
    await fs.rename(temporaryPath, finalPath);
    await pruneOldBackups();
    return {
      fileName,
      size: stats.size,
      createdAt: new Date().toISOString(),
      reason: safeReason(reason),
    };
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export function createBackup(options = {}) {
  assertBackupEnabled();
  return queueOperation(() => createBackupInternal(options));
}

async function markEmailed(fileName) {
  await fs.writeFile(mailMarkerPath(fileName), new Date().toISOString(), "utf-8");
}

async function wasEmailed(fileName) {
  try {
    await fs.access(mailMarkerPath(fileName));
    return true;
  } catch {
    return false;
  }
}

export async function sendBackupByEmail(fileName) {
  assertBackupEnabled();
  assertBackupRecipientConfigured();
  const filePath = backupPath(fileName);
  const stats = await validateDumpFile(filePath);
  const result = await sendBackupEmail({
    to: BACKUP_RECIPIENT,
    filePath,
    fileName,
    size: stats.size,
  });
  if (result.sent) await markEmailed(fileName);
  return result;
}

export async function createManualBackupAndEmail() {
  const backup = await createBackup({ reason: "manual" });
  try {
    const email = await sendBackupByEmail(backup.fileName);
    return { ...backup, emailSent: Boolean(email.sent), emailSkipped: Boolean(email.skipped) };
  } catch (error) {
    // La sauvegarde locale a déjà été créée avec succès. Une configuration SMTP
    // ou de destinataire incomplète ne doit jamais transformer ce succès en
    // perte de sauvegarde.
    return { ...backup, emailSent: false, emailError: String(error.message || error) };
  }
}

async function metadataFor(fileName) {
  const filePath = backupPath(fileName);
  const stats = await fs.stat(filePath);
  const type = fileName.split("-")[1] || "backup";
  return {
    fileName,
    type,
    size: stats.size,
    modifiedAt: stats.mtime.toISOString(),
    emailed: await wasEmailed(fileName),
  };
}

export async function listBackups() {
  if (!BACKUP_ENABLED) return [];
  await ensureBackupDirectory();
  const entries = await fs.readdir(BACKUP_DIR, { withFileTypes: true });
  const fileNames = entries
    .filter((entry) => entry.isFile() && isSafeBackupFilename(entry.name))
    .map((entry) => entry.name);
  const backups = await Promise.all(fileNames.map(metadataFor));
  backups.sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt));
  return backups;
}

export async function importBackupBuffer(buffer, sourceName = "") {
  assertBackupEnabled();
  if (!Buffer.isBuffer(buffer) || buffer.length < 1024) {
    throw new Error("Fichier de sauvegarde absent ou trop petit");
  }
  if (buffer.length > BACKUP_UPLOAD_MAX_BYTES) {
    throw new Error(`Sauvegarde trop volumineuse (${BACKUP_UPLOAD_MAX_BYTES} octets maximum)`);
  }

  return queueOperation(async () => {
    await ensureBackupDirectory();
    const fileName = buildBackupFilename("imported");
    const finalPath = backupPath(fileName);
    const temporaryPath = `${finalPath}.tmp`;
    try {
      await fs.writeFile(temporaryPath, buffer, { mode: 0o600 });
      await validateDumpFile(temporaryPath);
      await fs.rename(temporaryPath, finalPath);
      await pruneOldBackups();
      return {
        fileName,
        sourceName: String(sourceName || "").slice(0, 200),
        size: buffer.length,
        importedAt: new Date().toISOString(),
      };
    } catch (error) {
      await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    }
  });
}

async function restoreDumpFile(filePath) {
  await runPgTool("pg_restore", [
    "--clean",
    "--if-exists",
    "--exit-on-error",
    "--no-owner",
    "--no-privileges",
    "--dbname",
    DATABASE_URL,
    filePath,
  ], { timeout: 20 * 60 * 1000 });
}

async function revokeRestoredSessions() {
  const sql = `
    update user_sessions set revoked_at = coalesce(revoked_at, now());
    update password_reset_tokens set used_at = coalesce(used_at, now());
  `;
  await runPgTool("psql", ["--dbname", DATABASE_URL, "--set", "ON_ERROR_STOP=1", "--command", sql], {
    timeout: 2 * 60 * 1000,
  });
}

export async function restoreBackup(fileName) {
  assertBackupEnabled();
  return queueOperation(async () => {
    const requestedPath = backupPath(fileName);
    await validateDumpFile(requestedPath);

    const safetyBackup = await createBackupInternal({ reason: "pre-restore" });
    const safetyPath = backupPath(safetyBackup.fileName);
    let poolClosed = false;

    try {
      await getPool().end();
      poolClosed = true;
      await restoreDumpFile(requestedPath);
      await revokeRestoredSessions();
      return {
        ok: true,
        restoredFile: fileName,
        safetyBackup: safetyBackup.fileName,
        restartRequired: true,
      };
    } catch (error) {
      if (poolClosed) {
        try {
          await restoreDumpFile(safetyPath);
          await revokeRestoredSessions();
          error.message = `${error.message || error} — la sauvegarde de sécurité ${safetyBackup.fileName} a été réappliquée.`;
        } catch (rollbackError) {
          error.message = `${error.message || error} — échec également du retour de sécurité : ${rollbackError.message || rollbackError}`;
        }
        error.restartRequired = true;
      }
      throw error;
    }
  });
}

export async function pruneOldBackups() {
  if (!BACKUP_ENABLED) return;
  await ensureBackupDirectory();
  const cutoff = Date.now() - BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const entries = await fs.readdir(BACKUP_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !isSafeBackupFilename(entry.name)) continue;
    const filePath = backupPath(entry.name);
    const stats = await fs.stat(filePath);
    if (stats.mtimeMs >= cutoff) continue;
    await fs.rm(filePath, { force: true });
    await fs.rm(mailMarkerPath(entry.name), { force: true }).catch(() => undefined);
  }
}

export function getBackupConfig() {
  return {
    enabled: BACKUP_ENABLED,
    directory: BACKUP_DIR,
    timezone: BACKUP_TIMEZONE,
    hour: BACKUP_HOUR,
    recipient: BACKUP_RECIPIENT,
    emailConfigured: Boolean(BACKUP_RECIPIENT),
    retentionDays: BACKUP_RETENTION_DAYS,
    uploadMaxBytes: BACKUP_UPLOAD_MAX_BYTES,
  };
}

async function schedulerTick() {
  if (!BACKUP_ENABLED) return;
  const local = localParts();
  if (local.hour < BACKUP_HOUR) return;

  const fileName = scheduledFilename(local.date);
  const filePath = backupPath(fileName);
  let exists = true;
  try {
    await fs.access(filePath);
  } catch {
    exists = false;
  }

  if (!exists) {
    console.log(`[backup] création de la sauvegarde journalière ${fileName}`);
    await createBackup({ reason: "scheduled", fixedFileName: fileName });
  }

  // La sauvegarde locale quotidienne reste active même sans destinataire e-mail.
  // Dans ce cas le lundi ne déclenche simplement aucune tentative d'envoi.
  if (local.weekday === "Mon" && BACKUP_RECIPIENT && !(await wasEmailed(fileName))) {
    const lastAttempt = lastEmailAttemptByFile.get(fileName) || 0;
    if (Date.now() - lastAttempt >= EMAIL_RETRY_MS) {
      lastEmailAttemptByFile.set(fileName, Date.now());
      try {
        const emailResult = await sendBackupByEmail(fileName);
        console.log(`[backup] envoi hebdomadaire ${fileName}: ${emailResult.sent ? "OK" : "non envoyé"}`);
      } catch (error) {
        console.error(`[backup] envoi hebdomadaire impossible pour ${fileName}:`, error);
      }
    }
  }
}

export function startBackupScheduler() {
  if (!BACKUP_ENABLED) {
    markSchedulerDisabled("backup");
    console.log("[backup] planification désactivée sur cet environnement");
    return;
  }
  if (globalThis[BACKUP_SCHEDULER_FLAG]) return;
  globalThis[BACKUP_SCHEDULER_FLAG] = true;
  markSchedulerHealthy("backup");

  const run = () => schedulerTick()
    .then(() => markSchedulerHealthy("backup"))
    .catch((error) => {
      markSchedulerDegraded("backup");
      console.error("[backup] échec de la sauvegarde planifiée :", error);
    });

  setTimeout(run, 10_000);
  const timer = setInterval(run, 60_000);
  timer.unref?.();
  const emailState = BACKUP_RECIPIENT
    ? "envoi hebdomadaire configuré"
    : "envoi e-mail désactivé (BACKUP_RECIPIENT absent)";
  console.log(`[backup] planification active : tous les jours à ${String(BACKUP_HOUR).padStart(2, "0")}:00 (${BACKUP_TIMEZONE}); ${emailState}`);
}
