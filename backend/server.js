import "dotenv/config";
import express from "express";
import cors from "cors";
import pg from "pg";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { readFile } from "node:fs/promises";
import { installRouteManagementRoutes } from "./route-management-routes.js";
import { installRealisationManagementRoutes } from "./realisation-management-routes.js";
import { installSessionReadRoutes } from "./session-read-routes.js";
import { installParticipantCreationRoute } from "./participant-creation-route.js";
import { installBroadcastMessageRoutes } from "./broadcast-message-routes.js";
import { installEvolutionRequestRoutes } from "./evolution-request-routes.js";
import { installAuthSessionRoutes } from "./auth-session-routes.js";
import { installAdminAccessLogRoutes } from "./admin-access-log-routes.js";
import { installAdminAccountDeleteRoute } from "./admin-account-delete-route.js";
import { createAuthMiddleware } from "./auth-middleware.js";
import { installDatabaseMaintenanceRoutes } from "./database-maintenance-routes.js";
import { createCrossOriginCsrfBridge } from "./deployment-compatibility.js";
import {
  installExplicitAdminUserRoutes,
  initializeAdminUserEnhancements,
  startAdminUserSchedulers,
} from "./admin-users/explicit-routes.js";
import { blockLegacyFileImportInProduction } from "./admin-users/maintenance-hardening.js";
import { sanitizeMalformedCookieHeader } from "./admin-users/cookie-hardening.js";
import { preBodyRequestGuard } from "./admin-users/prebody-rate-limit.js";
import { trustedClientIpMiddleware } from "./admin-users/client-ip-hardening.js";
import { rateLimitLogMiddleware } from "./admin-users/rate-limit-log-integration.js";

const app = express();
app.disable("x-powered-by");

// Un cookie percent-encodé invalide ne doit jamais atteindre les parseurs legacy.
app.use(sanitizeMalformedCookieHeader);

// Le pont CSRF est désormais un middleware Express explicite. Il était auparavant
// injecté implicitement en surchargeant express.application.use.
app.use(createCrossOriginCsrfBridge());

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
const PORT = Number(process.env.PORT || 3000);

const CORS_ORIGINS = (process.env.CORS_ORIGIN || process.env.FRONTEND_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);
const SETUP_TOKEN = process.env.SETUP_TOKEN || "";
const FIRST_ADMIN_EMAIL = process.env.FIRST_ADMIN_EMAIL || "";
const FIRST_ADMIN_PASSWORD = process.env.FIRST_ADMIN_PASSWORD || "";
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "climbcrew_session";
const CSRF_COOKIE_NAME = process.env.CSRF_COOKIE_NAME || "climbcrew_csrf";
const COOKIE_SAMESITE = (process.env.COOKIE_SAMESITE || "lax").toLowerCase();
const SECURE_COOKIES = String(process.env.SECURE_COOKIES || (IS_PRODUCTION ? "true" : "false")).toLowerCase() === "true";
const ALLOW_WEAK_FIRST_ADMIN_PASSWORD = !IS_PRODUCTION && String(process.env.ALLOW_WEAK_FIRST_ADMIN_PASSWORD || process.env.DEV_ADMIN_ENABLED || "false").toLowerCase() === "true";
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || (IS_PRODUCTION ? 12 : 10));
const TRUST_PROXY = Number(process.env.TRUST_PROXY || 1);

const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * Number(process.env.SESSION_DURATION_DAYS || 7);
const RESET_TOKEN_DURATION_MS = 1000 * 60 * 60; // 1 heure
const MAX_JSON_BODY_SIZE = process.env.MAX_JSON_BODY_SIZE || "1mb";
const WRITE_RATE_LIMIT_PER_MINUTE = Number(process.env.WRITE_RATE_LIMIT_PER_MINUTE || 120);

if (!DATABASE_URL) {
  console.error("DATABASE_URL is missing.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: String(process.env.PG_SSL || "false").toLowerCase() === "true"
    ? { rejectUnauthorized: String(process.env.PG_SSL_REJECT_UNAUTHORIZED || "true").toLowerCase() !== "false" }
    : false,
});

app.set("trust proxy", TRUST_PROXY);

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
  if (SECURE_COOKIES || IS_PRODUCTION) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});


// Compatibilité robuste avec les reverse proxies locaux.
// Le frontend appelle /api/..., l'ancienne application utilisait /...,
// et certaines versions intermédiaires ont utilisé /api/v1/...
// Cette normalisation évite les erreurs du type "Cannot GET /api/..." ou "Cannot GET /v1/...".
function normalizeApiPath(url) {
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

app.use((req, _res, next) => {
  req.url = normalizeApiPath(req.url);
  next();
});

// Les garde-fous transverses sont désormais enregistrés explicitement, après
// normalisation de l'URL et avant CORS / express.json / limiteurs historiques.
app.use(preBodyRequestGuard);
app.use(trustedClientIpMiddleware);
app.use(rateLimitLogMiddleware);

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    const normalizedOrigin = origin.replace(/\/$/, "");
    if (CORS_ORIGINS.includes(normalizedOrigin)) return callback(null, true);
    return callback(new Error("Origine CORS non autorisée"));
  },
  credentials: true,
}));
app.use(express.json({ limit: MAX_JSON_BODY_SIZE }));

function nowPlus(ms) {
  return new Date(Date.now() + ms).toISOString();
}

function hashToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

function randomToken(size = 24) {
  return crypto.randomBytes(size).toString("hex");
}

function cleanEmail(value = "") {
  return String(value || "").trim().toLowerCase();
}

function defaultSessionStatus(date, slot) {
  const day = new Date(`${date}T12:00:00`).getDay();
  return slot === "midi" && (day === 2 || day === 4) ? "encadree" : "libre";
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        if (separator === -1) return [part, ""];
        return [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
      })
  );
}

function getCookie(req, name) {
  return parseCookies(req)[name] || "";
}

function getRequestToken(req) {
  // Le jeton de session est stocké en cookie HttpOnly. Le bearer token reste accepté
  // uniquement pour compatibilité avec d'anciens scripts locaux.
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (match?.[1]) return match[1];
  return getCookie(req, SESSION_COOKIE_NAME) || "";
}

function isSafeMethod(method) {
  return ["GET", "HEAD", "OPTIONS"].includes(String(method || "GET").toUpperCase());
}

function constantTimeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function setSessionCookie(res, rawToken, expiresAt) {
  res.cookie(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: SECURE_COOKIES,
    sameSite: COOKIE_SAMESITE,
    expires: new Date(expiresAt),
    path: "/",
  });
}

function setCsrfCookie(res, rawToken, expiresAt) {
  res.cookie(CSRF_COOKIE_NAME, rawToken, {
    httpOnly: false,
    secure: SECURE_COOKIES,
    sameSite: COOKIE_SAMESITE,
    expires: new Date(expiresAt),
    path: "/",
  });
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: SECURE_COOKIES,
    sameSite: COOKIE_SAMESITE,
    path: "/",
  });
  res.clearCookie(CSRF_COOKIE_NAME, {
    httpOnly: false,
    secure: SECURE_COOKIES,
    sameSite: COOKIE_SAMESITE,
    path: "/",
  });
}

function requireSetupAccess(req, res, next) {
  if (req.query.setupToken || req.query.token) {
    return res.status(400).json({
      ok: false,
      error: "Le jeton de maintenance doit être transmis uniquement dans l’en-tête X-Setup-Token.",
    });
  }

  const providedToken = req.headers["x-setup-token"];
  if (!SETUP_TOKEN) {
    return res.status(503).json({
      ok: false,
      error: "SETUP_TOKEN n'est pas configuré côté serveur. Ajoute cette variable d'environnement avant d'utiliser cette route.",
    });
  }
  if (!constantTimeEqual(providedToken, SETUP_TOKEN)) {
    return res.status(403).json({ ok: false, error: "Jeton de maintenance invalide" });
  }
  next();
}

const rateLimitBuckets = new Map();
const RATE_LIMIT_CLEANUP_INTERVAL_MS = 60 * 1000;
let nextRateLimitCleanupAt = 0;

function cleanupExpiredRateLimitBuckets(now = Date.now()) {
  if (now < nextRateLimitCleanupAt) return;
  for (const [key, bucket] of rateLimitBuckets.entries()) {
    if (!bucket || bucket.resetAt <= now) rateLimitBuckets.delete(key);
  }
  nextRateLimitCleanupAt = now + RATE_LIMIT_CLEANUP_INTERVAL_MS;
}

function rateLimit({ keyPrefix, windowMs, max }) {
  return (req, res, next) => {
    const now = Date.now();
    cleanupExpiredRateLimitBuckets(now);
    const key = `${keyPrefix}:${getClientIp(req) || "unknown"}`;
    const current = rateLimitBuckets.get(key) || { count: 0, resetAt: now + windowMs };
    if (current.resetAt <= now) {
      current.count = 0;
      current.resetAt = now + windowMs;
    }
    current.count += 1;
    rateLimitBuckets.set(key, current);
    if (current.count > max) {
      return res.status(429).json({ error: "Trop de tentatives. Réessaie plus tard." });
    }
    next();
  };
}

const authRateLimit = rateLimit({ keyPrefix: "auth", windowMs: 15 * 60 * 1000, max: 20 });
const resetRateLimit = rateLimit({ keyPrefix: "reset", windowMs: 60 * 60 * 1000, max: 10 });
const writeRateLimit = rateLimit({ keyPrefix: "write", windowMs: 60 * 1000, max: WRITE_RATE_LIMIT_PER_MINUTE });

app.use((req, res, next) => {
  if (isSafeMethod(req.method)) return next();
  return writeRateLimit(req, res, next);
});

function isStrongPassword(value) {
  return typeof value === "string"
    && value.length >= 8
    && /[a-z]/.test(value)
    && /[A-Z]/.test(value)
    && /\d/.test(value)
    && /[^A-Za-z0-9]/.test(value);
}

function serializeUser(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    participantId: row.participant_id ? String(row.participant_id) : null,
    email: row.email,
    prenom: row.prenom,
    nom: row.nom,
    role: row.role,
    status: row.status,
    created_at: row.created_at,
    approved_at: row.approved_at,
    revoked_at: row.revoked_at,
    revoked_reason: row.revoked_reason,
    last_login_at: row.last_login_at,
    must_reset_password: row.must_reset_password,
    theme_preference: row.theme_preference || 'auto',
  };
}

function getClientIp(req) {
  // Express calcule req.ip à partir de la socket et de la configuration
  // `trust proxy`. Ne jamais relire manuellement l'en-tête de proxy ici :
  // cela contournerait précisément la chaîne de confiance configurée par Express.
  return req.ip || null;
}

async function logAccess({ userId = null, eventType, success = true, req, details = null }) {
  try {
    await pool.query(
      `
        insert into access_logs (user_id, event_type, success, ip_address, user_agent, details)
        values ($1, $2, $3, $4, $5, $6::jsonb)
      `,
      [
        userId,
        eventType,
        success,
        getClientIp(req),
        req?.headers?.["user-agent"] || null,
        details ? JSON.stringify(details) : null,
      ]
    );
  } catch (error) {
    console.error("logAccess error:", error);
  }
}

async function ensureSchema() {
  await pool.query(`
    create table if not exists participants (
      id bigserial primary key,
      nom text not null,
      prenom text not null,
      email text not null default '',
      passport text not null default 'sans',
      sexe text not null default '' check (sexe in ('', 'h', 'f')),
      cotisation boolean not null default false,
      ffme boolean not null default false,
      can_encadrer boolean not null default false,
      can_referer boolean not null default false,
      can_admin boolean not null default false,
      created_at timestamptz not null default now()
    );

    create table if not exists sessions (
      id text primary key,
      date text not null,
      slot text not null check (slot in ('midi', 'matin', 'soir')),
      status text not null default 'fermee',
      encadrant_id text,
      referent_id text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists session_participants (
      session_id text not null references sessions(id) on delete cascade,
      participant_id text not null,
      created_at timestamptz not null default now(),
      primary key (session_id, participant_id)
    );

    alter table participants add column if not exists can_admin boolean not null default false;
    alter table participants add column if not exists email text not null default '';
    alter table participants add column if not exists sexe text not null default '';
    alter table participants add column if not exists avatar_id text not null default 'gecko';
    alter table participants add column if not exists crest_id text not null default 'cristal';
    alter table participants add column if not exists profile_public boolean not null default true;
    alter table participants add column if not exists custom_avatar_image text not null default '';

    alter table sessions drop constraint if exists sessions_slot_check;
    alter table sessions add constraint sessions_slot_check check (slot in ('midi', 'matin', 'soir'));

    create index if not exists idx_sessions_date on sessions(date);
    create index if not exists idx_session_participants_participant on session_participants(participant_id);

    create table if not exists users (
      id bigserial primary key,
      participant_id bigint references participants(id) on delete set null,
      email text unique not null,
      prenom text not null,
      nom text not null,
      password_hash text not null,
      role text not null default 'user',
      status text not null default 'pending',
      must_reset_password boolean not null default false,
      created_at timestamptz not null default now(),
      approved_at timestamptz,
      revoked_at timestamptz,
      revoked_reason text,
      last_login_at timestamptz
    );

    update participants p
    set email = u.email
    from users u
    where u.participant_id = p.id
      and coalesce(p.email, '') = '';

    create index if not exists idx_users_email on users(lower(email));
    create index if not exists idx_users_status on users(status);

    create table if not exists user_sessions (
      id bigserial primary key,
      user_id bigint not null references users(id) on delete cascade,
      token_hash text not null,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null,
      revoked_at timestamptz,
      user_agent text,
      ip_address text
    );

    create index if not exists idx_user_sessions_user on user_sessions(user_id);
    create index if not exists idx_user_sessions_token_hash on user_sessions(token_hash);

    create table if not exists password_reset_tokens (
      id bigserial primary key,
      user_id bigint not null references users(id) on delete cascade,
      token_hash text not null,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null,
      used_at timestamptz
    );

    create index if not exists idx_password_reset_tokens_user on password_reset_tokens(user_id);
    create index if not exists idx_password_reset_tokens_hash on password_reset_tokens(token_hash);

    create table if not exists access_logs (
      id bigserial primary key,
      user_id bigint references users(id) on delete set null,
      event_type text not null,
      success boolean not null default true,
      ip_address text,
      user_agent text,
      details jsonb,
      created_at timestamptz not null default now()
    );

    create index if not exists idx_access_logs_created_at on access_logs(created_at desc);
    create index if not exists idx_access_logs_event_type on access_logs(event_type);

    create table if not exists broadcast_messages (
      id bigserial primary key,
      title text not null check (char_length(title) between 3 and 120),
      body text not null check (char_length(body) between 3 and 2000),
      created_by bigint references users(id) on delete set null,
      created_at timestamptz not null default now()
    );

    create table if not exists broadcast_message_recipients (
      message_id bigint not null references broadcast_messages(id) on delete cascade,
      user_id bigint not null references users(id) on delete cascade,
      read_at timestamptz,
      primary key (message_id, user_id)
    );

    create index if not exists idx_broadcast_recipients_pending
      on broadcast_message_recipients(user_id, read_at, message_id);
  `);

  await pool.query(`
    create table if not exists ropes (
      numero_corde integer primary key,
      actif boolean not null default true,
      couleur_corde text not null default '',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists routes (
      id text primary key,
      numero_voie_unique text unique not null,
      numero_corde integer references ropes(numero_corde) on delete set null,
      couleur_prises text not null default '',
      cotation_reference text not null default '',
      cotation_ajustee text not null default '',
      nom_voie text not null default '',
      nom_ouvreur text not null default '',
      moulinette_only boolean not null default false,
      tags text[] not null default '{}',
      active boolean not null default true,
      date_creation text not null default '',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index if not exists idx_routes_numero_corde on routes(numero_corde);
    create index if not exists idx_routes_active on routes(active);

    create table if not exists route_ratings (
      route_id text not null references routes(id) on delete cascade,
      user_id bigint not null references users(id) on delete cascade,
      rating integer not null check (rating between 1 and 5),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (route_id, user_id)
    );

    create index if not exists idx_route_ratings_route on route_ratings(route_id);
  `);
  await pool.query(`alter table routes add column if not exists tags text[] not null default '{}'`);

  await pool.query(`
    create table if not exists realisations (
      id text primary key,
      participant_id text not null,
      session_id text not null,
      voie_id text not null,
      date_realisation text not null,
      style_realisation text not null,
      commentaire text,
      cotation_proposee text,
      nb_essais text,
      chute boolean not null default false,
      assureur_id text,
      rating integer check (rating between 1 and 5),
      tags text[] not null default '{}',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);

  await pool.query(`alter table realisations add column if not exists rating integer check (rating between 1 and 5)`);
  await pool.query(`alter table realisations add column if not exists tags text[] not null default '{}'`);
  await pool.query(`alter table realisations add column if not exists chute boolean not null default false`);
  await pool.query(`alter table realisations add column if not exists assureur_id text`);

  await pool.query(`create index if not exists idx_realisations_participant on realisations(participant_id)`);
  await pool.query(`create index if not exists idx_realisations_session on realisations(session_id)`);
  await pool.query(`create index if not exists idx_realisations_voie on realisations(voie_id)`);

  await pool.query(`alter table users add column if not exists theme_preference text not null default 'auto'`);

  await pool.query(`
    create table if not exists evolution_requests (
      id bigserial primary key,
      author_id bigint not null references users(id) on delete cascade,
      title text not null check (char_length(title) between 3 and 140),
      description text not null check (char_length(description) between 3 and 4000),
      status text not null default 'a_voir' check (status in ('a_voir', 'approuve', 'integre', 'trop_creatif')),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists evolution_comments (
      id bigserial primary key,
      request_id bigint not null references evolution_requests(id) on delete cascade,
      author_id bigint not null references users(id) on delete cascade,
      body text not null check (char_length(body) between 1 and 2000),
      created_at timestamptz not null default now()
    );

    create table if not exists evolution_votes (
      request_id bigint not null references evolution_requests(id) on delete cascade,
      user_id bigint not null references users(id) on delete cascade,
      value smallint not null check (value in (-1, 1)),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (request_id, user_id)
    );

    create index if not exists idx_evolution_requests_created on evolution_requests(created_at desc);
    create index if not exists idx_evolution_comments_request on evolution_comments(request_id, created_at);
    create index if not exists idx_evolution_votes_request on evolution_votes(request_id);
  `);

  await pool.query(`alter table evolution_requests add column if not exists status text not null default 'a_voir'`);

  // Les migrations de données restent séparées du démarrage de l'API.
  // Une donnée historique inattendue ne doit jamais empêcher le serveur de répondre.
}

async function ensureDefaultAdmin() {
  const activeAdmins = await pool.query(`select id from users where role = 'admin' and status = 'active' limit 1`);
  if (activeAdmins.rowCount > 0) return;

  const email = cleanEmail(FIRST_ADMIN_EMAIL);
  if (!email || !FIRST_ADMIN_PASSWORD) {
    console.warn("Aucun administrateur actif et FIRST_ADMIN_EMAIL / FIRST_ADMIN_PASSWORD non configurés. Aucun compte admin par défaut n'a été créé.");
    return;
  }

  if (!ALLOW_WEAK_FIRST_ADMIN_PASSWORD && !isStrongPassword(FIRST_ADMIN_PASSWORD)) {
    throw new Error("FIRST_ADMIN_PASSWORD doit respecter la règle de mot de passe fort.");
  }

  const passwordHash = await bcrypt.hash(FIRST_ADMIN_PASSWORD, BCRYPT_ROUNDS);

  await pool.query(
    `
      insert into users (email, prenom, nom, password_hash, role, status, approved_at, must_reset_password)
      values ($1, $2, $3, $4, 'admin', 'active', now(), false)
      on conflict (email) do update set
        password_hash = excluded.password_hash,
        role = 'admin',
        status = 'active',
        approved_at = coalesce(users.approved_at, now()),
        must_reset_password = false
    `,
    [email, "ClimbCrew", "Admin", passwordHash]
  );

  console.log(`Compte administrateur initial créé : ${email}. Change le mot de passe à la première utilisation.`);
}

const { requireAuth, requireAdmin } = createAuthMiddleware({
  pool,
  hashToken,
  getRequestToken,
  isSafeMethod,
  getCookie,
  csrfCookieName: CSRF_COOKIE_NAME,
  constantTimeEqual,
  serializeUser,
});

// Les remplacements historiques sont maintenant de vraies routes Express.
installExplicitAdminUserRoutes(app, {
  requireAuth,
  requireAdmin,
  authRateLimit,
  resetRateLimit,
});

installBroadcastMessageRoutes(app, { requireAuth, requireAdmin, pool });
installEvolutionRequestRoutes(app, { requireAuth, requireAdmin, pool });
installRealisationManagementRoutes(app, { requireAuth, pool });
installRouteManagementRoutes(app, { requireAuth, requireAdmin, pool });

app.get("/", (_req, res) => {
  res.send("ClimbCrew API running");
});

installDatabaseMaintenanceRoutes(app, {
  requireSetupAccess,
  ensureSchema,
  ensureDefaultAdmin,
  pool,
  firstAdminEmail: FIRST_ADMIN_EMAIL,
});

installAuthSessionRoutes(app, {
  requireAuth,
  pool,
  randomToken,
  nowPlus,
  sessionDurationMs: SESSION_DURATION_MS,
  setCsrfCookie,
  serializeUser,
  logAccess,
  clearSessionCookie,
});

installAdminAccessLogRoutes(app, { requireAuth, requireAdmin, pool });
installAdminAccountDeleteRoute(app, { requireAuth, requireAdmin, pool, logAccess });
installParticipantCreationRoute(app, { requireAuth, requireAdmin, pool });
installSessionReadRoutes(app, { requireAuth, requireAdmin, pool });

/**
 * Importe un export JSON legacy dans la base PostgreSQL.
 *
 * Format accepté :
 * - payload direct contenant participants/sessions/ropes/routes/realisations ;
 * - ou objet enveloppe { data: payload } envoyé par le frontend.
 *
 * L'import remplace les données métier legacy sans supprimer les comptes utilisateurs.
 * Les identifiants historiques de participants (p1, p2...) sont convertis vers les id
 * PostgreSQL tout en conservant les liens sessions/réalisations.
 */
app.post("/import-data", blockLegacyFileImportInProduction, requireSetupAccess, async (req, res) => {
  const importFilePath = new URL("./import-data.json", import.meta.url);
  if (!fs.existsSync(importFilePath)) {
    return res.status(404).json({ error: "import-data.json introuvable dans backend/" });
  }

  if (req.query.confirm !== "oui") {
    return res.status(400).json({ ok: false, error: "Ajoute ?confirm=oui et l’en-tête X-Setup-Token pour confirmer l’import." });
  }

  const client = await pool.connect();

  try {
    const payload = JSON.parse(await readFile(importFilePath, "utf-8"));
    await client.query("begin");

    await client.query("delete from session_participants");
    await client.query("delete from sessions");
    await client.query("delete from realisations");
    await client.query("delete from routes");
    await client.query("delete from ropes");
    await client.query("delete from participants");

    for (const rope of payload.ropes || []) {
      await client.query(
        `
          insert into ropes (numero_corde, actif, couleur_corde)
          values ($1,$2,$3)
          on conflict (numero_corde) do update set
            actif = excluded.actif,
            couleur_corde = excluded.couleur_corde,
            updated_at = now()
        `,
        [Number(rope.numeroCorde), rope.actif !== false, String(rope.couleurCorde || "")]
      );
    }

    const participantIdMap = new Map();

    for (const participant of payload.participants || []) {
      const result = await client.query(
        `
          insert into participants
          (nom, prenom, email, passport, sexe, cotisation, ffme, can_encadrer, can_referer, can_admin)
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          returning id
        `,
        [
          participant.nom,
          participant.prenom,
          String(participant.email || "").trim().toLowerCase(),
          participant.passport || "sans",
          String(participant.sexe || "").trim().toLowerCase(),
          Boolean(participant.cotisation),
          Boolean(participant.ffme),
          Boolean(participant.canEncadrer),
          Boolean(participant.canReferer),
          Boolean(participant.canAdmin),
        ]
      );

      participantIdMap.set(String(participant.id), String(result.rows[0].id));
    }

    for (const route of payload.routes || []) {
      await client.query(
        `
          insert into routes (
            id, numero_voie_unique, numero_corde, couleur_prises, cotation_reference,
            cotation_ajustee, nom_voie, nom_ouvreur, moulinette_only, active, date_creation
          ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
          on conflict (id) do update set
            numero_voie_unique = excluded.numero_voie_unique,
            numero_corde = excluded.numero_corde,
            couleur_prises = excluded.couleur_prises,
            cotation_reference = excluded.cotation_reference,
            cotation_ajustee = excluded.cotation_ajustee,
            nom_voie = excluded.nom_voie,
            nom_ouvreur = excluded.nom_ouvreur,
            moulinette_only = excluded.moulinette_only,
            active = excluded.active,
            date_creation = excluded.date_creation,
            updated_at = now()
        `,
        [
          route.id,
          route.numeroVoieUnique,
          Number(route.numeroCorde),
          route.couleurPrises || "",
          route.cotationReference || "",
          route.cotationAjustee || route.cotationReference || "",
          route.nomVoie || "",
          route.nomOuvreur || "",
          Boolean(route.moulinetteOnly),
          route.active !== false,
          route.dateCreation || "",
        ]
      );
    }

    for (const session of payload.sessions || []) {
      const mappedEncadrantId = session.encadrantId
        ? participantIdMap.get(String(session.encadrantId)) || null
        : null;

      const mappedReferentId = session.referentId
        ? participantIdMap.get(String(session.referentId)) || null
        : null;

      await client.query(
        `
          insert into sessions (id, date, slot, status, encadrant_id, referent_id)
          values ($1,$2,$3,$4,$5,$6)
          on conflict (id) do update set
            date = excluded.date,
            slot = excluded.slot,
            status = excluded.status,
            encadrant_id = excluded.encadrant_id,
            referent_id = excluded.referent_id,
            updated_at = now()
        `,
        [session.id, session.date, session.slot, session.status || "fermee", mappedEncadrantId, mappedReferentId]
      );

      const uniqueParticipantIds = [
        ...new Set((session.participantIds || []).map((id) => participantIdMap.get(String(id))).filter(Boolean)),
      ];

      for (const mappedParticipantId of uniqueParticipantIds) {
        await client.query(
          `
            insert into session_participants (session_id, participant_id)
            values ($1,$2)
            on conflict do nothing
          `,
          [session.id, mappedParticipantId]
        );
      }
    }

    await client.query("commit");

    res.json({
      ok: true,
      message: "Import terminé",
      participantsImported: payload.participants?.length || 0,
      sessionsImported: payload.sessions?.length || 0,
      ropesImported: payload.ropes?.length || 0,
      routesImported: payload.routes?.length || 0,
    });
  } catch (error) {
    await client.query("rollback");
    res.status(error.status || 500).json({ error: error.message || String(error), fields: error.fields || undefined });
  } finally {
    client.release();
  }
});

async function cleanupExpiredSecurityData() {
  await pool.query("update user_sessions set revoked_at = now() where revoked_at is null and expires_at <= now()");
  await pool.query("update password_reset_tokens set used_at = now() where used_at is null and expires_at <= now()");
}

async function start() {
  await ensureSchema();
  await initializeAdminUserEnhancements();
  await ensureDefaultAdmin();
  await cleanupExpiredSecurityData();

  app.listen(PORT, () => {
    console.log(`ClimbCrew API listening on port ${PORT}`);
  });

  startAdminUserSchedulers().catch((error) => {
    console.error("Erreur de démarrage des services utilisateurs :", error);
    process.exitCode = 1;
  });
}

start().catch((error) => {
  console.error("Erreur au démarrage :", error);
  process.exit(1);
});