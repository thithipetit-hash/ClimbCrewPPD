import { writeAccessLog } from "./access-log-service.js";

export const RATE_LIMIT_ERROR = "Trop de tentatives. Réessaie plus tard.";

function normalizedPath(req) {
  return String(req?.path || req?.url || "/").split("?")[0] || "/";
}

/**
 * Décrit la limite fonctionnelle correspondant à l'URL qui a renvoyé 429.
 * Toutes les écritures passent aussi par la limite globale "write" ; pour les
 * routes d'authentification et de réinitialisation, la limite spécialisée est
 * la plus informative à présenter dans le journal.
 */
export function describeRateLimit(pathname, {
  writeLimit = Number(process.env.WRITE_RATE_LIMIT_PER_MINUTE || 120),
} = {}) {
  const path = String(pathname || "/").split("?")[0];

  if (["/auth/login", "/auth/request-access"].includes(path)) {
    return {
      limiter: "auth",
      limit: 20,
      windowSeconds: 15 * 60,
      alsoSubjectToWriteLimit: true,
    };
  }

  if (["/auth/forgot-password", "/auth/reset-password"].includes(path)) {
    return {
      limiter: "reset",
      limit: 10,
      windowSeconds: 60 * 60,
      alsoSubjectToWriteLimit: true,
    };
  }

  return {
    limiter: "write",
    limit: writeLimit,
    windowSeconds: 60,
    alsoSubjectToWriteLimit: false,
  };
}

export function buildRateLimitLogDetails(req) {
  const path = normalizedPath(req);
  const descriptor = describeRateLimit(path);
  return {
    ...descriptor,
    method: String(req?.method || "GET").toUpperCase(),
    path,
    statusCode: 429,
    requestId: req?.requestId || null,
  };
}

/**
 * Observe uniquement les réponses 429 produites par les limiteurs historiques.
 * Le corps de requête et la chaîne de requête ne sont jamais journalisés afin
 * de ne pas enregistrer de mot de passe, jeton ou autre donnée sensible.
 */
export function rateLimitLogMiddleware(req, res, next) {
  const originalJson = res.json.bind(res);
  let logged = false;

  res.json = function rateLimitAwareJson(body) {
    if (!logged && res.statusCode === 429 && body?.error === RATE_LIMIT_ERROR) {
      logged = true;
      const userId = req.auth?.user?.id || req.enhancementAuth?.user?.id || null;

      void writeAccessLog({
        userId,
        eventType: "rate_limit_exceeded",
        success: false,
        req,
        details: buildRateLimitLogDetails(req),
      });
    }

    return originalJson(body);
  };

  next();
}
