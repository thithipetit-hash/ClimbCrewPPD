/**
 * Compatibilité des environnements de déploiement Linux et local.
 *
 * Ce fichier est chargé avant le serveur principal. Il prépare les variables
 * d'environnement communes sans imposer de valeurs lorsque l'administrateur
 * les a déjà définies.
 */

const SAFE_HTTP_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function normalizeOrigin(value = "") {
  return String(value || "").trim().replace(/\/$/, "");
}

function collectOrigins(...values) {
  return [...new Set(
    values
      .flatMap((value) => String(value || "").split(","))
      .map(normalizeOrigin)
      .filter(Boolean),
  )];
}

function safeDecodeCookie(value = "") {
  try {
    return decodeURIComponent(value);
  } catch {
    return String(value || "");
  }
}

function parseCookieHeader(header = "") {
  return Object.fromEntries(
    String(header || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        if (separator < 0) return [part, ""];
        return [part.slice(0, separator), safeDecodeCookie(part.slice(separator + 1))];
      }),
  );
}

function isProductionEnvironment() {
  return String(process.env.NODE_ENV || "").toLowerCase() === "production";
}

function isFirstAdminBootstrapAllowed() {
  return String(process.env.ALLOW_FIRST_ADMIN_BOOTSTRAP || "").toLowerCase() === "true";
}

function isCrossOriginCsrfBridgeEnabled() {
  return String(process.env.CROSS_ORIGIN_CSRF_BRIDGE || "").toLowerCase() === "true";
}

/**
 * Prépare les variables lues ensuite par server.js.
 *
 * En production, FIRST_ADMIN_PASSWORD est neutralisé sauf opt-in explicite.
 * Cela empêche ensureDefaultAdmin() de promouvoir ou de réinitialiser un compte
 * au simple redémarrage lorsque le dernier administrateur a été révoqué.
 * Pour une installation neuve, activer temporairement
 * ALLOW_FIRST_ADMIN_BOOTSTRAP=true, démarrer une fois, puis remettre false.
 */
export function configureDeploymentEnvironment() {
  const production = isProductionEnvironment();
  const localDevelopmentOrigin = production ? "" : "http://localhost:5173";
  const allowedOrigins = collectOrigins(
    process.env.CORS_ORIGIN,
    process.env.FRONTEND_ORIGIN,
    process.env.PUBLIC_URL,
    localDevelopmentOrigin,
  );

  if (allowedOrigins.length) {
    process.env.CORS_ORIGIN = allowedOrigins.join(",");
  }

  if (production && !isFirstAdminBootstrapAllowed()) {
    delete process.env.FIRST_ADMIN_PASSWORD;
  }
}

function getAllowedOrigins() {
  return new Set(collectOrigins(
    process.env.CORS_ORIGIN,
    process.env.FRONTEND_ORIGIN,
    process.env.PUBLIC_URL,
  ));
}

/**
 * Crée un middleware de compatibilité CSRF pour un éventuel déploiement
 * multi-domaines explicitement activé. Le cookie n'est recopié dans l'en-tête
 * interne que pour une origine autorisée.
 */
export function createCrossOriginCsrfBridge() {
  const enabled = isCrossOriginCsrfBridgeEnabled();
  const allowedOrigins = getAllowedOrigins();
  const csrfCookieName = process.env.CSRF_COOKIE_NAME || "climbcrew_csrf";

  return function crossOriginCsrfBridge(req, _res, next) {
    if (!enabled || SAFE_HTTP_METHODS.has(String(req.method || "GET").toUpperCase())) {
      return next();
    }

    if (req.headers["x-csrf-token"]) return next();

    const requestOrigin = normalizeOrigin(req.headers.origin);
    if (!requestOrigin || !allowedOrigins.has(requestOrigin)) return next();

    const csrfCookie = parseCookieHeader(req.headers.cookie)[csrfCookieName];
    if (csrfCookie) {
      req.headers["x-csrf-token"] = csrfCookie;
    }

    return next();
  };
}

export function describeDeploymentCompatibility() {
  return {
    platform: "linux-or-local",
    allowedOrigins: [...getAllowedOrigins()],
    crossOriginCsrfBridgeEnabled: isCrossOriginCsrfBridgeEnabled(),
    firstAdminBootstrapEnabled: !isProductionEnvironment() || isFirstAdminBootstrapAllowed(),
  };
}
