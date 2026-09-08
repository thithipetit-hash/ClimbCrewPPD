import pg from "pg";

const { Pool } = pg;

function envBoolean(value, fallback = false) {
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
  const isProduction = env.NODE_ENV === "production";
  const databaseUrl = String(env.DATABASE_URL || "").trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is missing.");
  }

  const port = integerEnv(env, "PORT", 3000, { min: 1, max: 65535 });
  const bcryptRounds = integerEnv(env, "BCRYPT_ROUNDS", isProduction ? 12 : 10, {
    min: isProduction ? 10 : 4,
    max: 20,
  });
  const trustProxy = integerEnv(env, "TRUST_PROXY", 1, { min: 0, max: 10 });
  const sessionDurationDays = integerEnv(env, "SESSION_DURATION_DAYS", 7, { min: 1, max: 365 });
  const resetTokenDurationMinutes = integerEnv(env, "RESET_TOKEN_DURATION_MINUTES", 60, { min: 5, max: 1440 });
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
    cookieSameSite: (env.COOKIE_SAMESITE || "lax").toLowerCase(),
    secureCookies: envBoolean(env.SECURE_COOKIES, isProduction),
    allowWeakFirstAdminPassword: !isProduction && envBoolean(env.ALLOW_WEAK_FIRST_ADMIN_PASSWORD || env.DEV_ADMIN_ENABLED, false),
    bcryptRounds,
    trustProxy,
    sessionDurationMs: 1000 * 60 * 60 * 24 * sessionDurationDays,
    resetTokenDurationMs: 1000 * 60 * resetTokenDurationMinutes,
    maxJsonBodySize: env.MAX_JSON_BODY_SIZE || "1mb",
    writeRateLimitPerMinute,
    pgSsl: envBoolean(env.PG_SSL, false),
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
