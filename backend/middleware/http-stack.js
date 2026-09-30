import crypto from "node:crypto";
import cors from "cors";
import express from "express";
import { createCrossOriginCsrfBridge } from "../deployment-compatibility.js";
import { sanitizeMalformedCookieHeader } from "../admin-users/cookie-hardening.js";
import { preBodyRequestGuard } from "../admin-users/prebody-rate-limit.js";
import { trustedClientIpMiddleware } from "../admin-users/client-ip-hardening.js";
import { rateLimitLogMiddleware } from "../admin-users/rate-limit-log-integration.js";
import { writeRuntimeDiagnosticLog } from "../runtime-diagnostic-log-service.js";

const EXPRESS4_ASYNC_WRAPPED = Symbol("climbcrew.express4AsyncWrapped");
const EXPRESS_REGISTRATION_METHODS = ["use", "all", "get", "post", "put", "patch", "delete", "options", "head"];
const SLOW_REQUEST_THRESHOLD_MS = 1000;

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

export function publicServerErrorBody(requestId = null, diagnosticStage = null) {
  return {
    error: "Erreur interne du serveur",
    requestId: requestId || null,
    diagnosticStage: diagnosticStage || null,
  };
}

export function requestPerformanceRecord(req, res, durationMs) {
  const path = String(req?.url || "/").split("?", 1)[0] || "/";
  const normalizedDuration = Math.max(0, Number(durationMs) || 0);
  return {
    event: "http_request",
    requestId: req?.requestId || null,
    method: String(req?.method || "GET").toUpperCase(),
    path,
    status: Number(res?.statusCode) || 0,
    durationMs: Math.round(normalizedDuration * 10) / 10,
    slow: normalizedDuration >= SLOW_REQUEST_THRESHOLD_MS,
  };
}

function installOutboundErrorSanitizer(req, res) {
  const originalSend = res.send.bind(res);
  res.send = function hardenedSend(body) {
    if (Number(res.statusCode) >= 500) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return originalSend(JSON.stringify(publicServerErrorBody(
        req.requestId,
        req.requestDiagnosticStage,
      )));
    }
    return originalSend(body);
  };
}

function isAccountRequest(req) {
  const path = String(req?.url || "/").split("?", 1)[0];
  return path === "/auth/request-access"
    || path === "/api/auth/request-access"
    || path === "/v1/auth/request-access";
}

function markAccountRequestStage(stage) {
  return (req, _res, next) => {
    if (isAccountRequest(req)) {
      req.requestDiagnosticStage = stage;
      writeRuntimeDiagnosticLog({
        req,
        eventType: "account_creation_trace",
        details: {
          requestId: req.requestId || null,
          stage,
        },
      });
    }
    next();
  };
}

function installAccountRequestDiagnosticSummary(req, res, next) {
  if (!isAccountRequest(req)) return next();

  res.once("finish", () => {
    const bodyKeys = req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? Object.keys(req.body).sort()
      : [];

    const summary = {
      event: "account_request_http_summary",
      requestId: req.requestId || null,
      status: Number(res.statusCode) || 0,
      diagnosticStage: req.requestDiagnosticStage || null,
      contentType: req.headers["content-type"] || null,
      contentLength: req.headers["content-length"] || null,
      bodyParsed: Boolean(req.body && typeof req.body === "object"),
      bodyKeys,
    };
    console.info(JSON.stringify(summary));
    writeRuntimeDiagnosticLog({
      req,
      eventType: "account_creation_result",
      success: summary.status < 400,
      details: {
        requestId: summary.requestId,
        stage: summary.diagnosticStage,
        status: summary.status,
        contentType: summary.contentType,
        contentLength: summary.contentLength,
        bodyParsed: summary.bodyParsed,
      },
    });
  });
  next();
}

function installProductionRequestMetrics(req, res, next) {
  const startedAt = process.hrtime.bigint();
  res.once("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const record = requestPerformanceRecord(req, res, durationMs);
    const serialized = JSON.stringify(record);
    if (record.status >= 500 || record.slow) console.warn(serialized);
    else console.info(serialized);
  });
  next();
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
  app.set("trust proxy", config.trustProxy);

  app.use((req, res, next) => {
    req.requestId = crypto.randomUUID();
    req.requestDiagnosticStage = "http.request_received";
    if (isAccountRequest(req)) {
      writeRuntimeDiagnosticLog({
        req,
        eventType: "account_creation_trace",
        details: {
          requestId: req.requestId,
          stage: req.requestDiagnosticStage,
        },
      });
    }
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

  app.use(installAccountRequestDiagnosticSummary);
  app.use(markAccountRequestStage("http.cookie_sanitizer"));
  app.use(sanitizeMalformedCookieHeader);
  app.use(markAccountRequestStage("http.csrf_bridge"));
  app.use(createCrossOriginCsrfBridge());

  app.use((req, _res, next) => {
    req.url = normalizeApiPath(req.url);
    if (isAccountRequest(req)) req.requestDiagnosticStage = "http.path_normalized";
    next();
  });

  if (config.isProduction) {
    app.use(installProductionRequestMetrics);
  }

  app.use(markAccountRequestStage("http.prebody_guard"));
  app.use(preBodyRequestGuard);
  app.use(markAccountRequestStage("http.trusted_client_ip"));
  app.use(trustedClientIpMiddleware);
  app.use(markAccountRequestStage("http.rate_limit_log"));
  app.use(rateLimitLogMiddleware);
  app.use(markAccountRequestStage("http.cors"));
  app.use(cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      const normalizedOrigin = origin.replace(/\/$/, "");
      if (config.corsOrigins.includes(normalizedOrigin)) return callback(null, true);
      return callback(new Error("Origine CORS non autorisée"));
    },
    credentials: true,
  }));
  app.use(markAccountRequestStage("http.json_body_parser"));
  app.use(express.json({ limit: config.maxJsonBodySize }));
  app.use(markAccountRequestStage("http.json_body_parsed"));

  const authRateLimit = createRateLimiter({ keyPrefix: "auth", windowMs: 15 * 60 * 1000, max: 20, getClientIp });
  const resetRateLimit = createRateLimiter({ keyPrefix: "reset", windowMs: 60 * 60 * 1000, max: 10, getClientIp });
  const writeRateLimit = createRateLimiter({
    keyPrefix: "write",
    windowMs: 60 * 1000,
    max: config.writeRateLimitPerMinute,
    getClientIp,
  });

  app.use(markAccountRequestStage("http.write_rate_limit"));
  app.use((req, res, next) => {
    if (isSafeMethod(req.method)) return next();
    return writeRateLimit(req, res, next);
  });
  app.use(markAccountRequestStage("http.route_dispatch"));

  return { authRateLimit, resetRateLimit };
}
