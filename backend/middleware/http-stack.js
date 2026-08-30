import crypto from "node:crypto";
import cors from "cors";
import express from "express";
import { createCrossOriginCsrfBridge } from "../deployment-compatibility.js";
import { sanitizeMalformedCookieHeader } from "../admin-users/cookie-hardening.js";
import { preBodyRequestGuard } from "../admin-users/prebody-rate-limit.js";
import { trustedClientIpMiddleware } from "../admin-users/client-ip-hardening.js";
import { rateLimitLogMiddleware } from "../admin-users/rate-limit-log-integration.js";

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

function createRateLimiter({ keyPrefix, windowMs, max, getClientIp }) {
  const buckets = new Map();
  const cleanupIntervalMs = 60 * 1000;
  let nextCleanupAt = 0;

  function cleanup(now) {
    if (now < nextCleanupAt) return;
    for (const [key, bucket] of buckets.entries()) {
      if (!bucket || bucket.resetAt <= now) buckets.delete(key);
    }
    nextCleanupAt = now + cleanupIntervalMs;
  }

  return (req, res, next) => {
    const now = Date.now();
    cleanup(now);
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
  app.disable("x-powered-by");
  app.use(sanitizeMalformedCookieHeader);
  app.use(createCrossOriginCsrfBridge());
  app.set("trust proxy", config.trustProxy);

  app.use((req, res, next) => {
    req.requestId = crypto.randomUUID();
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
