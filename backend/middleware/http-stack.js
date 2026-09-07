import crypto from "node:crypto";
import cors from "cors";
import express from "express";
import { createCrossOriginCsrfBridge } from "../deployment-compatibility.js";
import { sanitizeMalformedCookieHeader } from "../admin-users/cookie-hardening.js";
import { preBodyRequestGuard } from "../admin-users/prebody-rate-limit.js";
import { trustedClientIpMiddleware } from "../admin-users/client-ip-hardening.js";
import { rateLimitLogMiddleware } from "../admin-users/rate-limit-log-integration.js";

const EXPRESS4_ASYNC_WRAPPED = Symbol("climbcrew.express4AsyncWrapped");
const EXPRESS_REGISTRATION_METHODS = ["use", "all", "get", "post", "put", "patch", "delete", "options", "head"];

function wrapExpress4AsyncHandler(handler) {
  if (typeof handler !== "function") return handler;
  if (handler[EXPRESS4_ASYNC_WRAPPED]) return handler;
  if (handler.constructor?.name !== "AsyncFunction") return handler;

  let wrapped;
  if (handler.length === 4) {
    wrapped = function express4AsyncErrorHandler(error, req, res, next) {
      Promise.resolve(handler(error, req, res, next)).catch(next);
    };
  } else {
    wrapped = function express4AsyncHandler(req, res, next) {
      Promise.resolve(handler(req, res, next)).catch(next);
    };
  }

  Object.defineProperty(wrapped, EXPRESS4_ASYNC_WRAPPED, { value: true });
  Object.defineProperty(wrapped, "name", {
    value: handler.name ? `asyncSafe_${handler.name}` : "asyncSafeHandler",
    configurable: true,
  });
  return wrapped;
}

function wrapRegistrationArgument(argument) {
  if (Array.isArray(argument)) return argument.map(wrapRegistrationArgument);
  return wrapExpress4AsyncHandler(argument);
}

/**
 * Express 4 ne propage pas nativement les Promise rejetées vers next(error).
 * Le serveur enregistre beaucoup de contrôleurs async : on sécurise donc les
 * méthodes d'enregistrement une fois, avant l'installation des routes.
 */
export function installExpress4AsyncSafety(app) {
  for (const method of EXPRESS_REGISTRATION_METHODS) {
    const original = app[method];
    if (typeof original !== "function" || original[EXPRESS4_ASYNC_WRAPPED]) continue;

    const safeRegistration = function safeExpressRegistration(...args) {
      return original.apply(this, args.map(wrapRegistrationArgument));
    };
    Object.defineProperty(safeRegistration, EXPRESS4_ASYNC_WRAPPED, { value: true });
    app[method] = safeRegistration;
  }
}

export function normalizeApiPath(url) {
  const value = String(url || "/");
  const queryIndex = value.indexOf("?");
  const path = queryIndex === -1 ? value : value.slice(0, queryIndex);
  const query = queryIndex === -1 ? "" : value.slice(queryIndex);

  let normalizedPath = path;
  if (normalizedPath === "/api") normalizedPath = "/";
  else if (normalizedPath.startsWith("/api/")) normalizedPath = normalizedPath.slice(4);
  if (normalizedPath === "/v1") normalizedPath = "/";
  else if (normalizedPath.startsWith("/v1/")) normalizedPath = normalizedPath.slice(3);
  if (!normalizedPath.startsWith("/")) normalizedPath = `/${normalizedPath}`;
  return `${normalizedPath}${query}`;
}

export function publicServerErrorBody(requestId = null) {
  return {
    error: "Erreur interne du serveur",
    requestId: requestId || null,
  };
}

function installOutboundErrorSanitizer(req, res) {
  const originalSend = res.send.bind(res);
  res.send = function hardenedSend(body) {
    if (Number(res.statusCode) >= 500) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return originalSend(JSON.stringify(publicServerErrorBody(req.requestId)));
    }
    return originalSend(body);
  };
}

function createRateLimiter({ keyPrefix, windowMs, max, getClientIp }) {
  const buckets = new Map();
  const cleanupIntervalMs = 60 * 1000;
  let nextCleanupAt = 0;

  function cleanupExpiredRateLimitBuckets(now) {
    if (now < nextCleanupAt) return;
    for (const [key, bucket] of buckets.entries()) {
      if (!bucket || bucket.resetAt <= now) buckets.delete(key);
    }
    nextCleanupAt = now + cleanupIntervalMs;
  }

  return (req, res, next) => {
    const now = Date.now();
    cleanupExpiredRateLimitBuckets(now);
    const key = `${keyPrefix}:${getClientIp(req) || "unknown"}`;
    const current = buckets.get(key) || { count: 0, resetAt: now + windowMs };
    if (current.resetAt <= now) {
      current.count = 0;
      current.resetAt = now + windowMs;
    }
    current.count += 1;
    buckets.set(key, current);
    if (current.count > max) {
      return res.status(429).json({ error: "Trop de tentatives. Réessaie plus tard." });
    }
    next();
  };
}

export function installHttpStack(app, config, { isSafeMethod, getClientIp }) {
  installExpress4AsyncSafety(app);
  app.disable("x-powered-by");
  app.use(sanitizeMalformedCookieHeader);
  app.use(createCrossOriginCsrfBridge());
  app.set("trust proxy", config.trustProxy);

  app.use((req, res, next) => {
    req.requestId = crypto.randomUUID();
    installOutboundErrorSanitizer(req, res);
    res.setHeader("X-Request-Id", req.requestId);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader("Cross-Origin-Resource-Policy", "same-site");
    res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    res.setHeader("Cache-Control", "no-store");
    if (config.secureCookies || config.isProduction) {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
  });

  app.use((req, _res, next) => {
    req.url = normalizeApiPath(req.url);
    next();
  });

  app.use(preBodyRequestGuard);
  app.use(trustedClientIpMiddleware);
  app.use(rateLimitLogMiddleware);
  app.use(cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      const normalizedOrigin = origin.replace(/\/$/, "");
      if (config.corsOrigins.includes(normalizedOrigin)) return callback(null, true);
      return callback(new Error("Origine CORS non autorisée"));
    },
    credentials: true,
  }));
  app.use(express.json({ limit: config.maxJsonBodySize }));

  const authRateLimit = createRateLimiter({ keyPrefix: "auth", windowMs: 15 * 60 * 1000, max: 20, getClientIp });
  const resetRateLimit = createRateLimiter({ keyPrefix: "reset", windowMs: 60 * 60 * 1000, max: 10, getClientIp });
  const writeRateLimit = createRateLimiter({
    keyPrefix: "write",
    windowMs: 60 * 1000,
    max: config.writeRateLimitPerMinute,
    getClientIp,
  });

  app.use((req, res, next) => {
    if (isSafeMethod(req.method)) return next();
    return writeRateLimit(req, res, next);
  });

  return { authRateLimit, resetRateLimit };
}
