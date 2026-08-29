export const CANONICAL_RATE_LIMIT_IP = Symbol.for("climbcrew.canonical-rate-limit-ip");

const WINDOW_MS = 60_000;
const OVERFLOW_IP = "0.0.0.0";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const SMALL_PUBLIC_AUTH_PATHS = new Set([
  "/auth/login",
  "/auth/request-access",
  "/auth/forgot-password",
  "/auth/reset-password",
]);

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(parsed)));
}

const MAX_TRACKED_CLIENTS = boundedInteger(
  process.env.PRE_BODY_MAX_TRACKED_CLIENTS,
  4096,
  512,
  50_000,
);
const REQUESTS_PER_WINDOW = boundedInteger(
  process.env.PRE_BODY_RATE_LIMIT_PER_MINUTE,
  30,
  10,
  300,
);
const PUBLIC_AUTH_MAX_BYTES = boundedInteger(
  process.env.PUBLIC_AUTH_MAX_BODY_BYTES,
  64 * 1024,
  8 * 1024,
  256 * 1024,
);
const GENERAL_JSON_MAX_BYTES = boundedInteger(
  process.env.GENERAL_JSON_MAX_BODY_BYTES,
  2 * 1024 * 1024,
  256 * 1024,
  8 * 1024 * 1024,
);

// Les clés restent volontairement bornées pendant toute la vie du processus.
// Une fois la capacité atteinte, les nouvelles IP partagent OVERFLOW_IP : cela
// empêche aussi le limiteur historique non purgé de créer de nouvelles clés.
const buckets = new Map();

function requestPath(req) {
  return String(req.path || req.url || "/").split("?")[0] || "/";
}

function contentLength(req) {
  const value = Number(req.headers?.["content-length"] || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function canonicalClientIp(req) {
  const actualIp = String(req.ip || req.socket?.remoteAddress || "unknown").trim() || "unknown";
  if (buckets.has(actualIp)) return actualIp;
  if (buckets.size < MAX_TRACKED_CLIENTS) return actualIp;
  return OVERFLOW_IP;
}

function takeBucket(key, now = Date.now()) {
  const current = buckets.get(key);
  if (!current) {
    const created = { count: 1, expiresAt: now + WINDOW_MS };
    buckets.set(key, created);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (current.expiresAt <= now) {
    current.count = 1;
    current.expiresAt = now + WINDOW_MS;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  current.count += 1;
  if (current.count <= REQUESTS_PER_WINDOW) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((current.expiresAt - now) / 1000)),
  };
}

/**
 * Garde-fou exécuté avant express.json().
 *
 * - bloque les rafales d'écriture avant de parser leur corps ;
 * - borne le nombre de clés IP conservées en mémoire ;
 * - refuse les corps anormalement gros sur les routes publiques d'authentification ;
 * - limite les JSON ordinaires à 2 Mo avant parsing. L'import legacy administrateur
 *   reste l'unique exception JSON car il peut contenir un export métier complet.
 */
export function preBodyRequestGuard(req, res, next) {
  const method = String(req.method || "GET").toUpperCase();
  if (SAFE_METHODS.has(method)) return next();

  const path = requestPath(req);
  const length = contentLength(req);
  const contentType = String(req.headers?.["content-type"] || "").toLowerCase();
  const isJson = contentType.includes("application/json") || contentType.includes("+json");

  if (isJson && SMALL_PUBLIC_AUTH_PATHS.has(path) && length > PUBLIC_AUTH_MAX_BYTES) {
    return res.status(413).json({ error: "Corps de requête trop volumineux" });
  }
  if (isJson && path !== "/admin/import-data" && length > GENERAL_JSON_MAX_BYTES) {
    return res.status(413).json({ error: "Corps de requête trop volumineux" });
  }

  const canonicalIp = canonicalClientIp(req);
  req[CANONICAL_RATE_LIMIT_IP] = canonicalIp;

  // Les anciens contrôleurs lisent X-Forwarded-For. On leur fournit la même clé
  // bornée afin que leur Map historique ne puisse plus croître au-delà du plafond.
  req.headers["x-forwarded-for"] = canonicalIp;
  req.headers["x-real-ip"] = canonicalIp;

  const bucket = takeBucket(canonicalIp);
  if (!bucket.allowed) {
    res.setHeader("Retry-After", String(bucket.retryAfterSeconds));
    return res.status(429).json({ error: "Trop de tentatives. Réessaie plus tard." });
  }

  return next();
}

export function describePreBodyRateLimit() {
  return {
    maxTrackedClients: MAX_TRACKED_CLIENTS,
    requestsPerMinute: REQUESTS_PER_WINDOW,
    publicAuthMaxBytes: PUBLIC_AUTH_MAX_BYTES,
    generalJsonMaxBytes: GENERAL_JSON_MAX_BYTES,
    trackedClients: buckets.size,
  };
}
