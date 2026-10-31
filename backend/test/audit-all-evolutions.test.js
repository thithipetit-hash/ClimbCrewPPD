import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

import { createSecurityConfig } from "../config/security-config.js";
import { parseSessionWindow } from "../session-read-routes.js";
import { getSchedulerHealthSnapshot, markSchedulerHealthy } from "../scheduler-health.js";

test("l'identité e-mail et la configuration de sécurité ont une source canonique", async () => {
  const [auth, account, runtime, adminConfig] = await Promise.all([
    readFile(new URL("../admin-users/auth-hardening-service.js", import.meta.url), "utf8"),
    readFile(new URL("../admin-users/account-service.js", import.meta.url), "utf8"),
    readFile(new URL("../config/runtime-config.js", import.meta.url), "utf8"),
    readFile(new URL("../admin-users/config.js", import.meta.url), "utf8"),
  ]);
  assert.match(auth, /climbcrew_normalize_email\(email\) = climbcrew_normalize_email\(\$1\)/);
  assert.doesNotMatch(auth, /where lower\(email\) = \$1 limit 1/);
  assert.doesNotMatch(account, /export async function requestAccess\(/);
  assert.doesNotMatch(account, /export async function verifyEmailRequest\(/);
  assert.doesNotMatch(account, /export async function forgotPassword\(/);
  assert.doesNotMatch(account, /export async function updateAdminRight\(/);
  assert.match(runtime, /createSecurityConfig/);
  assert.match(adminConfig, /createSecurityConfig/);

  const config = createSecurityConfig({
    NODE_ENV: "test",
    BCRYPT_ROUNDS: "8",
    SESSION_DURATION_DAYS: "9",
    RESET_TOKEN_DURATION_MINUTES: "45",
    COOKIE_SAMESITE: "strict",
    SECURE_COOKIES: "false",
  });
  assert.equal(config.bcryptRounds, 8);
  assert.equal(config.sessionDurationMs, 9 * 24 * 60 * 60 * 1000);
  assert.equal(config.resetTokenDurationMs, 45 * 60 * 1000);
  assert.equal(config.cookieSameSite, "strict");
  assert.equal(config.secureCookies, false);
});

test("les resets destructifs exigent confirmation et sauvegarde avant mutation", async () => {
  const source = await readFile(new URL("../admin-users/explicit-routes.js", import.meta.url), "utf8");
  assert.match(source, /createBackup\(\{ reason: `pre-reset-\$\{type\}` \}\)/);
  assert.match(source, /RESET_\$\{type\.toUpperCase\(\)\}/);
  assert.match(source, /Réinitialisation refusée : la sauvegarde de sécurité PostgreSQL n’a pas pu être créée/);
  assert.match(source, /await client\.query\("begin"\)/);
  assert.match(source, /await client\.query\("commit"\)/);
});

test("une séance avec historique est refusée explicitement et les fenêtres sont validées", async () => {
  assert.deepEqual(parseSessionWindow({ from: "2026-01-01", to: "2026-12-31" }), {
    from: "2026-01-01",
    to: "2026-12-31",
  });
  assert.throws(() => parseSessionWindow({ from: "2026-13-01" }), /date invalide/i);
  assert.throws(() => parseSessionWindow({ from: "2026-12-31", to: "2026-01-01" }), /antérieure/i);

  const source = await readFile(new URL("../session-read-routes.js", import.meta.url), "utf8");
  assert.match(source, /select count\(\*\)::integer as count from realisations where session_id = \$1/);
  assert.match(source, /res\.status\(409\)/);
});

test("la migration de dates est transactionnelle, le schéma canonique reste uniquement dans les migrations", async () => {
  const [migration, runtime] = await Promise.all([
    readFile(new URL("../database/migrations/025_typed_business_dates.sql", import.meta.url), "utf8"),
    readFile(new URL("../config/runtime-config.js", import.meta.url), "utf8"),
  ]);
  await assert.rejects(access(new URL("../schema.sql", import.meta.url)));
  assert.match(migration, /raise exception 'Migration 025 refusée/);
  assert.match(migration, /alter table sessions[\s\S]*alter column date type date/);
  assert.match(migration, /alter table realisations[\s\S]*alter column date_realisation type date/);
  assert.doesNotMatch(migration, /delete\s+from/i);
  assert.match(runtime, /setTypeParser\(1082/);
});

test("la santé démarre dégradée tant que les schedulers obligatoires ne sont pas initialisés", () => {
  const initial = getSchedulerHealthSnapshot();
  assert.equal(initial.degraded, true);
  markSchedulerHealthy("backup");
  markSchedulerHealthy("access-log-retention");
  markSchedulerHealthy("security-retention");
  assert.equal(getSchedulerHealthSnapshot().degraded, false);
});

test("le workflow vérifie la conservation des identifiants métier après déploiement", async () => {
  const workflow = await readFile(new URL("../../.github/workflows/deploy.yml", import.meta.url), "utf8");
  assert.match(workflow, /Vérifier la conservation des comptes et données existants/);
  assert.match(workflow, /comm -23 "\$DATA_SNAPSHOT" "\$CURRENT_SNAPSHOT"/);
  assert.match(workflow, /users:/);
  assert.match(workflow, /participants:/);
  assert.match(workflow, /realisations:/);
});
