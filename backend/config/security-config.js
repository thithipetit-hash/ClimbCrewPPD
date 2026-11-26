function envBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value).toLowerCase() === "true";
}

function boundedInteger(env, name, fallback, { min, max }) {
  const raw = env[name];
  const value = raw === undefined || raw === null || raw === "" ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

/**
 * Source de vérité unique des paramètres d'authentification/cookies.
 * Ne dépend volontairement pas de DATABASE_URL afin de rester utilisable
 * dans les services isolés et les tests.
 */
export function createSecurityConfig(env = process.env) {
  const isProduction = env.NODE_ENV === "production";
  const configuredSameSite = String(env.COOKIE_SAMESITE || "lax").toLowerCase();
  const cookieSameSite = ["lax", "strict", "none"].includes(configuredSameSite)
    ? configuredSameSite
    : "lax";
  const bcryptRounds = boundedInteger(env, "BCRYPT_ROUNDS", isProduction ? 12 : 10, {
    min: isProduction ? 10 : 4,
    max: 20,
  });
  const sessionDurationDays = boundedInteger(env, "SESSION_DURATION_DAYS", 7, { min: 1, max: 365 });
  const resetTokenDurationMinutes = boundedInteger(
    env,
    "RESET_TOKEN_DURATION_MINUTES",
    60,
    { min: 5, max: 1440 },
  );

  return {
    isProduction,
    bcryptRounds,
    sessionDurationMs: 1000 * 60 * 60 * 24 * sessionDurationDays,
    resetTokenDurationMs: 1000 * 60 * resetTokenDurationMinutes,
    cookieSameSite,
    secureCookies: envBoolean(env.SECURE_COOKIES, isProduction),
  };
}
