import pg from "pg";
import { createSecurityConfig } from "./security-config.js";

const { Pool, types } = pg;

// Les colonnes SQL DATE doivent rester des chaînes AAAA-MM-JJ dans l'API afin
// de préserver exactement le contrat frontend historique après la migration 025.
types.setTypeParser(1082, (value) => value);

function booleanEnv(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value).toLowerCase() === "true";
}

function integerEnv(env, name, fallback, { min, max }) {
  const raw = env[name];
  const value = raw === undefined || raw === null || raw === ""
    ? fallback
    : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

export function createRuntimeConfig(env = process.env) {
  const security = createSecurityConfig(env);
  const isProduction = security.isProduction;
  const databaseUrl = String(env.DATABASE_URL || "").trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is missing.");
  }

  const port = integerEnv(env, "PORT", 3000, { min: 1, max: 65535 });
  const trustProxy = integerEnv(env, "TRUST_PROXY", 1, { min: 0, max: 10 });
  const writeRateLimitPerMinute = integerEnv(env, "WRITE_RATE_LIMIT_PER_MINUTE", 120, { min: 1, max: 10000 });

  return {
    databaseUrl,
    port,
    corsOrigins: (env.CORS_ORIGIN || env.FRONTEND_ORIGIN || "http://localhost:5173")
      .split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean),
    setupToken: env.SETUP_TOKEN || "",
    firstAdminEmail: env.FIRST_ADMIN_EMAIL || "",
    firstAdminPassword: env.FIRST_ADMIN_PASSWORD || "",
    isProduction,
    sessionCookieName: env.SESSION_COOKIE_NAME || "climbcrew_session",
    csrfCookieName: env.CSRF_COOKIE_NAME || "climbcrew_csrf",
    cookieSameSite: security.cookieSameSite,
    secureCookies: security.secureCookies,
    allowWeakFirstAdminPassword: !isProduction
      && String(env.ALLOW_WEAK_FIRST_ADMIN_PASSWORD || env.DEV_ADMIN_ENABLED || "").toLowerCase() === "true",
    bcryptRounds: security.bcryptRounds,
    trustProxy,
    sessionDurationMs: security.sessionDurationMs,
    resetTokenDurationMs: security.resetTokenDurationMs,
    maxJsonBodySize: env.MAX_JSON_BODY_SIZE || "1mb",
    writeRateLimitPerMinute,
    pgSsl: booleanEnv(env.PG_SSL, false),
    pgSslRejectUnauthorized: String(env.PG_SSL_REJECT_UNAUTHORIZED || "true").toLowerCase() !== "false",
  };
}

export function createDatabasePool(config) {
  return new Pool({
    connectionString: config.databaseUrl,
    ssl: config.pgSsl
      ? { rejectUnauthorized: config.pgSslRejectUnauthorized }
      : false,
  });
}
