import pg from "pg";

const { Pool } = pg;

function envBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value).toLowerCase() === "true";
}

export function createRuntimeConfig(env = process.env) {
  const isProduction = env.NODE_ENV === "production";
  const databaseUrl = env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is missing.");
  }

  return {
    databaseUrl,
    port: Number(env.PORT || 3000),
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
    bcryptRounds: Number(env.BCRYPT_ROUNDS || (isProduction ? 12 : 10)),
    trustProxy: Number(env.TRUST_PROXY || 1),
    sessionDurationMs: 1000 * 60 * 60 * 24 * Number(env.SESSION_DURATION_DAYS || 7),
    resetTokenDurationMs: 1000 * 60 * 60,
    maxJsonBodySize: env.MAX_JSON_BODY_SIZE || "1mb",
    writeRateLimitPerMinute: Number(env.WRITE_RATE_LIMIT_PER_MINUTE || 120),
    pgSsl: envBoolean(env.PG_SSL, false),
    pgSslRejectUnauthorized: !envBoolean(env.PG_SSL_REJECT_UNAUTHORIZED, false),
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
