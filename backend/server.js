import "dotenv/config";
import express from "express";
import cors from "cors";
import pg from "pg";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { readFile } from "node:fs/promises";
import {
  ValidationError,
  validateLegacyImportPayload,
  validateParticipantPayload,
  validateRealisationPayload,
  validateRoutePayload,
  validateSessionPayload,
} from "./validation.js";

const app = express();
app.disable("x-powered-by");
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
const MAX_JSON_BODY_SIZE = process.env.MAX_JSON_BODY_SIZE || "512kb";
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
  const providedToken = req.headers["x-setup-token"] || req.query.setupToken || req.query.token;
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
function rateLimit({ keyPrefix, windowMs, max }) {
  return (req, res, next) => {
    const key = `${keyPrefix}:${getClientIp(req) || "unknown"}`;
    const now = Date.now();
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

function firstLetter(value = "") {
  return String(value || "").trim().charAt(0).toUpperCase();
}

function isStrongPassword(value) {
  return typeof value === "string"
    && value.length >= 12
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
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
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
      active boolean not null default true,
      date_creation text not null default '',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index if not exists idx_routes_numero_corde on routes(numero_corde);
    create index if not exists idx_routes_active on routes(active);
  `);

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
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);

  await pool.query(`create index if not exists idx_realisations_participant on realisations(participant_id)`);
  await pool.query(`create index if not exists idx_realisations_session on realisations(session_id)`);
  await pool.query(`create index if not exists idx_realisations_voie on realisations(voie_id)`);

  await pool.query(`alter table users add column if not exists theme_preference text not null default 'auto'`);

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

async function findParticipantId(prenom, nom) {
  const result = await pool.query(
    `
      select id
      from participants
      where lower(prenom) = lower($1)
        and lower(nom) = lower($2)
      limit 1
    `,
    [String(prenom || "").trim(), firstLetter(nom)]
  );

  return result.rows[0]?.id || null;
}

async function loadSessionFromToken(rawToken) {
  const tokenHash = hashToken(rawToken);

  const result = await pool.query(
    `
      select
        us.id as session_id,
        us.user_id,
        us.expires_at,
        us.revoked_at,
        u.id,
        u.participant_id,
        u.email,
        u.prenom,
        u.nom,
        u.role,
        u.status,
        u.created_at,
        u.approved_at,
        u.revoked_at as user_revoked_at,
        u.revoked_reason,
        u.last_login_at,
        u.must_reset_password,
        u.theme_preference
      from user_sessions us
      join users u on u.id = us.user_id
      where us.token_hash = $1
        and us.revoked_at is null
        and us.expires_at > now()
      limit 1
    `,
    [tokenHash]
  );

  return result.rows[0] || null;
}

async function requireAuth(req, res, next) {
  const rawToken = getRequestToken(req);

  if (!rawToken) {
    return res.status(401).json({ error: "Authentification requise" });
  }

  const session = await loadSessionFromToken(rawToken);

  if (!session || session.status !== "active") {
    return res.status(401).json({ error: "Session invalide ou compte non actif" });
  }

  if (!isSafeMethod(req.method)) {
    const csrfHeader = req.headers["x-csrf-token"];
    const csrfCookie = getCookie(req, CSRF_COOKIE_NAME);
    if (!csrfHeader || !csrfCookie || !constantTimeEqual(csrfHeader, csrfCookie)) {
      return res.status(403).json({ error: "Protection CSRF : jeton absent ou invalide" });
    }
  }

  req.auth = {
    token: rawToken,
    sessionId: session.session_id,
    user: serializeUser(session),
  };

  next();
}

function requireAdmin(req, res, next) {
  if (req.auth?.user?.role !== "admin") {
    return res.status(403).json({ error: "Accès administrateur requis" });
  }
  next();
}


app.get("/realisations", requireAuth, async (_req, res) => {
  try {
    const result = await pool.query(`
      select
        id,
        participant_id as "participantId",
        session_id as "sessionId",
        voie_id as "voieId",
        date_realisation as "dateRealisation",
        style_realisation as "styleRealisation",
        commentaire,
        cotation_proposee as "cotationProposee",
        nb_essais as "nbEssais"
      from realisations
      order by date_realisation desc, created_at desc
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || String(error), fields: error.fields || undefined });
  }
});

app.post("/realisations", requireAuth, async (req, res) => {
  try {
    const realisation = validateRealisationPayload(req.body || {});
    await pool.query(
      `
        insert into realisations (
          id, participant_id, session_id, voie_id, date_realisation, style_realisation,
          commentaire, cotation_proposee, nb_essais
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `,
      [
        realisation.id,
        realisation.participantId,
        realisation.sessionId,
        realisation.voieId,
        realisation.dateRealisation,
        realisation.styleRealisation,
        realisation.commentaire || "",
        realisation.cotationProposee || "",
        realisation.nbEssais || "",
      ]
    );
    res.json(realisation);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || String(error), fields: error.fields || undefined });
  }
});

app.put("/realisations/:id", requireAuth, async (req, res) => {
  try {
    const patch = validateRealisationPayload(req.body || {}, { partial: true });
    await pool.query(
      `
        update realisations
        set
          participant_id = coalesce($2, participant_id),
          session_id = coalesce($3, session_id),
          voie_id = coalesce($4, voie_id),
          date_realisation = coalesce($5, date_realisation),
          style_realisation = coalesce($6, style_realisation),
          commentaire = coalesce($7, commentaire),
          cotation_proposee = coalesce($8, cotation_proposee),
          nb_essais = coalesce($9, nb_essais),
          updated_at = now()
        where id = $1
      `,
      [
        req.params.id,
        patch.participantId ?? null,
        patch.sessionId ?? null,
        patch.voieId ?? null,
        patch.dateRealisation ?? null,
        patch.styleRealisation ?? null,
        patch.commentaire ?? null,
        patch.cotationProposee ?? null,
        patch.nbEssais ?? null,
      ]
    );
    res.json({ ok: true });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || String(error), fields: error.fields || undefined });
  }
});

app.delete("/realisations/:id", requireAuth, async (req, res) => {
  try {
    await pool.query(`delete from realisations where id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || String(error), fields: error.fields || undefined });
  }
});


function participantDbToApi(row) {
  return {
    id: String(row.id),
    nom: row.nom,
    prenom: row.prenom,
    email: row.email || "",
    passport: row.passport,
    cotisation: row.cotisation,
    ffme: row.ffme,
    canEncadrer: row.can_encadrer,
    canReferer: row.can_referer,
    canAdmin: row.can_admin,
  };
}

function sessionDbToApi(row, participantIds = []) {
  return {
    id: row.id,
    date: row.date,
    slot: row.slot,
    status: row.status,
    encadrantId: row.encadrant_id ? String(row.encadrant_id) : null,
    referentId: row.referent_id ? String(row.referent_id) : null,
    participantIds: participantIds.map(String),
  };
}

function ropeDbToApi(row) {
  return {
    numeroCorde: Number(row.numero_corde),
    actif: Boolean(row.actif),
    couleurCorde: row.couleur_corde || "",
  };
}

function routeDbToApi(row) {
  return {
    id: row.id,
    numeroVoieUnique: row.numero_voie_unique,
    numeroCorde: row.numero_corde === null ? null : Number(row.numero_corde),
    couleurPrises: row.couleur_prises || "",
    cotationReference: row.cotation_reference || "",
    cotationAjustee: row.cotation_ajustee || row.cotation_reference || "",
    nomVoie: row.nom_voie || "",
    nomOuvreur: row.nom_ouvreur || "",
    moulinetteOnly: Boolean(row.moulinette_only),
    active: Boolean(row.active),
    dateCreation: row.date_creation || "",
  };
}

app.get("/ropes", requireAuth, async (_req, res) => {
  try {
    const result = await pool.query(`
      select numero_corde, actif, couleur_corde
      from ropes
      order by numero_corde asc
    `);
    res.json(result.rows.map(ropeDbToApi));
  } catch (error) {
    console.error("GET /ropes", error);
    res.status(500).json({ error: "Erreur chargement cordes" });
  }
});

app.get("/routes", requireAuth, async (_req, res) => {
  try {
    const result = await pool.query(`
      select *
      from routes
      order by numero_corde asc nulls last, numero_voie_unique asc
    `);
    res.json(result.rows.map(routeDbToApi));
  } catch (error) {
    console.error("GET /routes", error);
    res.status(500).json({ error: "Erreur chargement voies" });
  }
});

app.post("/routes", requireAuth, requireAdmin, async (req, res) => {
  try {
    const requestedRoute = req.body || {};
    const id = requestedRoute.id || `route-${Date.now()}`;
    const route = validateRoutePayload({
      ...requestedRoute,
      id,
      numeroVoieUnique: requestedRoute.numeroVoieUnique || id,
    });
    const result = await pool.query(
      `
        insert into routes (
          id, numero_voie_unique, numero_corde, couleur_prises, cotation_reference,
          cotation_ajustee, nom_voie, nom_ouvreur, moulinette_only, active, date_creation
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        returning *
      `,
      [
        id,
        String(route.numeroVoieUnique || "").trim(),
        route.numeroCorde === undefined || route.numeroCorde === null || route.numeroCorde === ""
          ? null
          : Number(route.numeroCorde),
        String(route.couleurPrises || "").trim(),
        String(route.cotationReference || "").trim(),
        String(route.cotationAjustee || route.cotationReference || "").trim(),
        String(route.nomVoie || "").trim(),
        String(route.nomOuvreur || "").trim(),
        Boolean(route.moulinetteOnly),
        route.active !== false,
        String(route.dateCreation || "").trim(),
      ]
    );
    res.status(201).json(routeDbToApi(result.rows[0]));
  } catch (error) {
    console.error("POST /routes", error);
    res.status(error.status || 500).json({ error: error.message || "Erreur création voie", fields: error.fields || undefined });
  }
});

app.put("/routes/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const route = validateRoutePayload(req.body || {}, { partial: true });
    const result = await pool.query(
      `
        update routes
        set
          numero_voie_unique = coalesce($2, numero_voie_unique),
          numero_corde = coalesce($3, numero_corde),
          couleur_prises = coalesce($4, couleur_prises),
          cotation_reference = coalesce($5, cotation_reference),
          cotation_ajustee = coalesce($6, cotation_ajustee),
          nom_voie = coalesce($7, nom_voie),
          nom_ouvreur = coalesce($8, nom_ouvreur),
          moulinette_only = coalesce($9, moulinette_only),
          active = coalesce($10, active),
          date_creation = coalesce($11, date_creation),
          updated_at = now()
        where id = $1
        returning *
      `,
      [
        req.params.id,
        route.numeroVoieUnique ?? null,
        route.numeroCorde === undefined ? null : Number(route.numeroCorde),
        route.couleurPrises ?? null,
        route.cotationReference ?? null,
        route.cotationAjustee ?? null,
        route.nomVoie ?? null,
        route.nomOuvreur ?? null,
        route.moulinetteOnly ?? null,
        route.active ?? null,
        route.dateCreation ?? null,
      ]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Voie introuvable" });
    res.json(routeDbToApi(result.rows[0]));
  } catch (error) {
    console.error("PUT /routes/:id", error);
    res.status(error.status || 500).json({ error: error.message || "Erreur mise à jour voie", fields: error.fields || undefined });
  }
});

app.delete("/routes/:id", requireAuth, requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const routeResult = await client.query(
      "select id from routes where id = $1 for update",
      [req.params.id],
    );
    if (!routeResult.rowCount) {
      await client.query("rollback");
      return res.status(404).json({ error: "Voie introuvable" });
    }

    const realisationsResult = await client.query(
      "delete from realisations where voie_id = $1",
      [req.params.id],
    );
    await client.query("delete from routes where id = $1", [req.params.id]);
    await client.query("commit");

    res.json({ ok: true, deletedRealisations: realisationsResult.rowCount });
  } catch (error) {
    await client.query("rollback");
    res.status(500).json({ error: error.message || "Suppression de la voie impossible" });
  } finally {
    client.release();
  }
});

app.get("/", (_req, res) => {
  res.send("ClimbCrew API running");
});

app.get("/health", async (_req, res) => {
  try {
    await pool.query("select 1");
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error) });
  }
});

app.get("/setup-db", requireSetupAccess, async (_req, res) => {
  try {
    await ensureSchema();
    await ensureDefaultAdmin();
    res.json({
      ok: true,
      message: "Schéma prêt. Si aucun admin n'existait, le compte FIRST_ADMIN_EMAIL a été créé uniquement si les variables FIRST_ADMIN_EMAIL et FIRST_ADMIN_PASSWORD sont configurées.",
      firstAdminEmailConfigured: Boolean(FIRST_ADMIN_EMAIL),
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error) });
  }
});

app.get("/db-status", requireSetupAccess, async (_req, res) => {
  try {
    const result = await pool.query(`
      select
        current_database() as database,
        to_regclass('public.participants') as participants,
        to_regclass('public.sessions') as sessions,
        to_regclass('public.session_participants') as session_participants,
        to_regclass('public.users') as users,
        to_regclass('public.user_sessions') as user_sessions,
        to_regclass('public.password_reset_tokens') as password_reset_tokens,
        to_regclass('public.access_logs') as access_logs,
        to_regclass('public.ropes') as ropes,
        to_regclass('public.routes') as routes,
        to_regclass('public.realisations') as realisations
    `);

    res.json({ ok: true, ...result.rows[0] });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error) });
  }
});

/**
 * Auth
 */
app.post("/auth/login", authRateLimit, async (req, res) => {
  const email = cleanEmail(req.body?.email);
  const password = String(req.body?.password || "");

  try {
    const result = await pool.query(`select * from users where lower(email) = $1 limit 1`, [email]);
    const user = result.rows[0];

    if (!user) {
      await logAccess({
        userId: null,
        eventType: "login_failed",
        success: false,
        req,
        details: { email, reason: "unknown_email" },
      });
      return res.status(401).json({ error: "Identifiants invalides" });
    }

    if (user.status !== "active") {
      await logAccess({
        userId: user.id,
        eventType: "login_blocked",
        success: false,
        req,
        details: { email, status: user.status },
      });
      return res.status(403).json({ error: `Compte ${user.status}` });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      await logAccess({
        userId: user.id,
        eventType: "login_failed",
        success: false,
        req,
        details: { email, reason: "bad_password" },
      });
      return res.status(401).json({ error: "Identifiants invalides" });
    }

    const rawToken = randomToken(32);
    const expiresAt = nowPlus(SESSION_DURATION_MS);

    await pool.query(
      `
        insert into user_sessions (user_id, token_hash, expires_at, user_agent, ip_address)
        values ($1, $2, $3, $4, $5)
      `,
      [user.id, hashToken(rawToken), expiresAt, req.headers["user-agent"] || null, getClientIp(req)]
    );

    const updatedUserResult = await pool.query(
      `update users set last_login_at = now() where id = $1 returning *`,
      [user.id]
    );

    await logAccess({
      userId: user.id,
      eventType: "login_success",
      success: true,
      req,
      details: { email },
    });

    const csrfToken = randomToken(24);
    setSessionCookie(res, rawToken, expiresAt);
    setCsrfCookie(res, csrfToken, expiresAt);

    res.json({
      ok: true,
      user: serializeUser(updatedUserResult.rows[0]),
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || String(error), fields: error.fields || undefined });
  }
});

app.get("/auth/me", requireAuth, async (req, res) => {
  res.json({ ok: true, user: req.auth.user });
});

app.get("/auth/csrf", requireAuth, async (req, res) => {
  const csrfToken = randomToken(24);
  const expiresAt = nowPlus(SESSION_DURATION_MS);
  setCsrfCookie(res, csrfToken, expiresAt);
  res.json({ ok: true });
});


app.put("/auth/theme", requireAuth, async (req, res) => {
  const nextTheme = String(req.body?.theme_preference || "auto").trim().toLowerCase();
  const allowed = new Set(["auto", "light", "dark", "fun", "craie_ardoise", "ocean_mineral", "foret_mousse", "terre_cuite", "aurore_alpine", "lavande_nocturne", "sable_corde", "bloc_neon", "glacier", "cristal"]);

  if (!allowed.has(nextTheme)) {
    return res.status(400).json({ error: "Préférence de thème invalide" });
  }

  try {
    const result = await pool.query(
      `
        update users
        set theme_preference = $2
        where id = $1
        returning *
      `,
      [req.auth.user.id, nextTheme]
    );

    const user = serializeUser(result.rows[0]);

    res.json({ ok: true, user });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || String(error), fields: error.fields || undefined });
  }
});

app.post("/auth/logout", requireAuth, async (req, res) => {
  try {
    await pool.query(`update user_sessions set revoked_at = now() where id = $1`, [req.auth.sessionId]);

    await logAccess({
      userId: req.auth.user.id,
      eventType: "logout",
      success: true,
      req,
      details: { email: req.auth.user.email },
    });

    clearSessionCookie(res);
    res.json({ ok: true });
  } catch (error) {
    clearSessionCookie(res);
    res.status(500).json({ error: "Erreur lors de la déconnexion" });
  }
});

app.post("/auth/request-access", authRateLimit, async (req, res) => {
  const prenom = String(req.body?.prenom || "").trim();
  const nom = String(req.body?.nom || "").trim();
  const email = cleanEmail(req.body?.email);
  const password = String(req.body?.password || "");
  const acceptTerms = Boolean(req.body?.acceptTerms);

  if (!prenom || !nom || !email) {
    return res.status(400).json({ error: "Prénom, nom et email sont requis" });
  }
  if (!acceptTerms) {
    return res.status(400).json({ error: "Les conditions d’utilisation doivent être acceptées" });
  }
  if (!isStrongPassword(password)) {
    return res.status(400).json({ error: "Mot de passe insuffisamment robuste" });
  }

  try {
    const existing = await pool.query(`select id from users where lower(email) = $1`, [email]);
    if (existing.rowCount > 0) {
      return res.status(409).json({ error: "Un compte existe déjà pour cet email" });
    }

    const participantId = await findParticipantId(prenom, nom);
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const result = await pool.query(
      `
        insert into users (participant_id, email, prenom, nom, password_hash, role, status)
        values ($1, $2, $3, $4, $5, 'user', 'pending')
        returning *
      `,
      [participantId, email, prenom, nom, passwordHash]
    );

    if (participantId) {
      await pool.query(
        `update participants set email = $2 where id = $1 and coalesce(email, '') = ''`,
        [participantId, email]
      );
    }

    await logAccess({
      userId: result.rows[0].id,
      eventType: "request_access",
      success: true,
      req,
      details: { email, participantId },
    });

    res.json({
      ok: true,
      message: "Demande d’accès enregistrée. Un administrateur doit l’approuver.",
      user: serializeUser(result.rows[0]),
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || String(error), fields: error.fields || undefined });
  }
});

app.post("/auth/forgot-password", resetRateLimit, async (req, res) => {
  const email = cleanEmail(req.body?.email);

  try {
    const result = await pool.query(`select id, email from users where lower(email) = $1 limit 1`, [email]);
    const user = result.rows[0] || null;

    await logAccess({
      userId: user?.id || null,
      eventType: "forgot_password_requested",
      success: true,
      req,
      details: { email },
    });

    res.json({
      ok: true,
      message: "La demande a été enregistrée. Un administrateur peut désormais générer un code de réinitialisation.",
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || String(error), fields: error.fields || undefined });
  }
});

app.post("/auth/reset-password", resetRateLimit, async (req, res) => {
  const email = cleanEmail(req.body?.email);
  const rawToken = String(req.body?.token || "").trim();
  const password = String(req.body?.password || "");

  if (!email || !rawToken || !password) {
    return res.status(400).json({ error: "Email, code et nouveau mot de passe sont requis" });
  }
  if (!isStrongPassword(password)) {
    return res.status(400).json({ error: "Mot de passe insuffisamment robuste" });
  }

  const client = await pool.connect();
  try {
    await client.query("begin");

    const userResult = await client.query(`select * from users where lower(email) = $1 limit 1`, [email]);
    const user = userResult.rows[0];

    if (!user) {
      await client.query("rollback");
      return res.status(404).json({ error: "Compte introuvable" });
    }

    const tokenHash = hashToken(rawToken);
    const tokenResult = await client.query(
      `
        select *
        from password_reset_tokens
        where user_id = $1
          and token_hash = $2
          and used_at is null
          and expires_at > now()
        limit 1
      `,
      [user.id, tokenHash]
    );

    const resetToken = tokenResult.rows[0];
    if (!resetToken) {
      await client.query("rollback");
      return res.status(400).json({ error: "Code de réinitialisation invalide ou expiré" });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    await client.query(
      `
        update users
        set password_hash = $2,
            must_reset_password = false
        where id = $1
      `,
      [user.id, passwordHash]
    );

    await client.query(
      `update password_reset_tokens set used_at = now() where id = $1`,
      [resetToken.id]
    );

    await client.query(
      `update user_sessions set revoked_at = now() where user_id = $1 and revoked_at is null`,
      [user.id]
    );

    await client.query("commit");

    await logAccess({
      userId: user.id,
      eventType: "password_reset_completed",
      success: true,
      req,
      details: { email },
    });

    res.json({
      ok: true,
      message: "Mot de passe réinitialisé. Tu peux te reconnecter.",
    });
  } catch (error) {
    await client.query("rollback");
    res.status(error.status || 500).json({ error: error.message || String(error), fields: error.fields || undefined });
  } finally {
    client.release();
  }
});

/**
 * Admin auth
 */
app.get("/admin/auth/users", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const result = await pool.query(
      `
        select id, participant_id, email, prenom, nom, role, status, must_reset_password, created_at, approved_at, revoked_at, revoked_reason, last_login_at
        from users
        order by
          case status
            when 'pending' then 0
            when 'active' then 1
            when 'revoked' then 2
            else 3
          end,
          created_at desc,
          email asc
      `
    );

    res.json({ ok: true, users: result.rows.map(serializeUser) });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || String(error), fields: error.fields || undefined });
  }
});

app.get("/admin/auth/logs", requireAuth, requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 200), 500);
    const result = await pool.query(
      `
        select
          al.id,
          al.event_type,
          al.success,
          al.ip_address,
          al.user_agent,
          al.created_at,
          al.details,
          coalesce(u.email, al.details->>'email') as email,
          coalesce(al.details::text, '') as details_text
        from access_logs al
        left join users u on u.id = al.user_id
        order by al.created_at desc
        limit $1
      `,
      [limit]
    );

    res.json({ ok: true, logs: result.rows });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || String(error), fields: error.fields || undefined });
  }
});

app.post("/admin/auth/users/:id/approve", requireAuth, requireAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const result = await pool.query(
      `
        update users
        set status = 'active',
            approved_at = now(),
            revoked_at = null,
            revoked_reason = null
        where id = $1
        returning *
      `,
      [userId]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Compte introuvable" });
    }

    await logAccess({
      userId,
      eventType: "account_approved",
      success: true,
      req,
      details: { by: req.auth.user.email },
    });

    res.json({ ok: true, user: serializeUser(result.rows[0]) });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || String(error), fields: error.fields || undefined });
  }
});

app.post("/admin/auth/users/:id/revoke", requireAuth, requireAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const reason = String(req.body?.reason || "Révocation administrateur");

    const result = await pool.query(
      `
        update users
        set status = 'revoked',
            revoked_at = now(),
            revoked_reason = $2
        where id = $1
        returning *
      `,
      [userId, reason]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Compte introuvable" });
    }

    await pool.query(`update user_sessions set revoked_at = now() where user_id = $1 and revoked_at is null`, [userId]);

    await logAccess({
      userId,
      eventType: "account_revoked",
      success: true,
      req,
      details: { by: req.auth.user.email, reason },
    });

    res.json({ ok: true, user: serializeUser(result.rows[0]) });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || String(error), fields: error.fields || undefined });
  }
});

app.delete("/admin/auth/users/:id", requireAuth, requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: "Identifiant du compte invalide" });
    }
    if (Number(req.auth.user.id) === userId) {
      return res.status(409).json({ error: "Vous ne pouvez pas supprimer votre propre compte." });
    }

    await client.query("begin");
    const userResult = await client.query(
      "select id, email, role, status from users where id = $1 for update",
      [userId],
    );
    if (!userResult.rowCount) {
      await client.query("rollback");
      return res.status(404).json({ error: "Compte introuvable" });
    }

    const user = userResult.rows[0];
    if (user.role === "admin" && user.status === "active") {
      const adminsResult = await client.query(
        "select count(*)::integer as count from users where role = 'admin' and status = 'active'",
      );
      if (adminsResult.rows[0].count <= 1) {
        await client.query("rollback");
        return res.status(409).json({ error: "Le dernier compte administrateur actif ne peut pas être supprimé." });
      }
    }

    await client.query("delete from users where id = $1", [userId]);
    await client.query("commit");

    await logAccess({
      userId: req.auth.user.id,
      eventType: "account_deleted",
      success: true,
      req,
      details: { deletedUserId: userId, deletedEmail: user.email },
    });
    res.json({ ok: true });
  } catch (error) {
    await client.query("rollback");
    res.status(500).json({ error: error.message || "Suppression du compte impossible" });
  } finally {
    client.release();
  }
});

app.post("/admin/auth/users/:id/reactivate", requireAuth, requireAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const result = await pool.query(
      `
        update users
        set status = 'active',
            revoked_at = null,
            revoked_reason = null
        where id = $1
        returning *
      `,
      [userId]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Compte introuvable" });
    }

    await logAccess({
      userId,
      eventType: "account_reactivated",
      success: true,
      req,
      details: { by: req.auth.user.email },
    });

    res.json({ ok: true, user: serializeUser(result.rows[0]) });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || String(error), fields: error.fields || undefined });
  }
});

app.post("/admin/auth/users/:id/reset-token", requireAuth, requireAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const userResult = await pool.query(`select id, email from users where id = $1`, [userId]);

    if (!userResult.rowCount) {
      return res.status(404).json({ error: "Compte introuvable" });
    }

    const rawToken = randomToken(4).toUpperCase();
    const expiresAt = nowPlus(RESET_TOKEN_DURATION_MS);

    await pool.query(
      `
        insert into password_reset_tokens (user_id, token_hash, expires_at)
        values ($1, $2, $3)
      `,
      [userId, hashToken(rawToken), expiresAt]
    );

    await logAccess({
      userId,
      eventType: "password_reset_token_generated",
      success: true,
      req,
      details: { by: req.auth.user.email, expiresAt },
    });

    res.json({
      ok: true,
      resetToken: rawToken,
      expiresAt,
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || String(error), fields: error.fields || undefined });
  }
});

/**
 * Participants
 */
app.get("/participants", requireAuth, async (_req, res) => {
  try {
    const result = await pool.query(`
      select id, nom, prenom, email, passport, cotisation, ffme, can_encadrer, can_referer, can_admin
      from participants
      order by prenom asc, nom asc
    `);
    res.json(result.rows.map(participantDbToApi));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || String(error), fields: error.fields || undefined });
  }
});

app.post("/participants", requireAuth, requireAdmin, async (req, res) => {
  try {
    const {
      nom,
      prenom,
      email,
      passport,
      cotisation,
      ffme,
      canEncadrer,
      canReferer,
      canAdmin,
    } = validateParticipantPayload(req.body || {});

    const result = await pool.query(
      `
        insert into participants
        (nom, prenom, email, passport, cotisation, ffme, can_encadrer, can_referer, can_admin)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        returning id, nom, prenom, email, passport, cotisation, ffme, can_encadrer, can_referer, can_admin
      `,
      [nom, prenom, String(email || "").trim().toLowerCase(), passport, cotisation, ffme, canEncadrer, canReferer, canAdmin]
    );

    res.status(201).json(participantDbToApi(result.rows[0]));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || String(error), fields: error.fields || undefined });
  }
});

app.put("/participants/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new ValidationError("L'identifiant du participant est invalide.", {
        id: "invalid_identifier",
      });
    }
    const {
      nom,
      prenom,
      email,
      passport,
      cotisation,
      ffme,
      canEncadrer,
      canReferer,
      canAdmin,
    } = validateParticipantPayload(req.body || {});

    const result = await pool.query(
      `
        update participants
        set nom = $2,
            prenom = $3,
            email = $4,
            passport = $5,
            cotisation = $6,
            ffme = $7,
            can_encadrer = $8,
            can_referer = $9,
            can_admin = $10
        where id = $1
        returning id, nom, prenom, email, passport, cotisation, ffme, can_encadrer, can_referer, can_admin
      `,
      [id, nom, prenom, String(email || "").trim().toLowerCase(), passport, cotisation, ffme, canEncadrer, canReferer, canAdmin]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "participant not found" });
    }

    res.json(participantDbToApi(result.rows[0]));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || String(error), fields: error.fields || undefined });
  }
});

app.delete("/participants/:id", requireAuth, requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Identifiant du grimpeur invalide" });
    }

    await client.query("begin");
    const participantResult = await client.query(
      "select id from participants where id = $1 for update",
      [id],
    );
    if (!participantResult.rowCount) {
      await client.query("rollback");
      return res.status(404).json({ error: "Grimpeur introuvable" });
    }

    await client.query("update users set participant_id = null where participant_id = $1", [id]);
    const inscriptionsResult = await client.query(
      "delete from session_participants where participant_id = $1",
      [String(id)],
    );
    await client.query(
      "update sessions set encadrant_id = null where encadrant_id = $1",
      [String(id)],
    );
    await client.query(
      "update sessions set referent_id = null where referent_id = $1",
      [String(id)],
    );
    const realisationsResult = await client.query(
      "delete from realisations where participant_id = $1",
      [String(id)],
    );
    await client.query("delete from participants where id = $1", [id]);
    await client.query("commit");

    res.json({
      ok: true,
      deletedInscriptions: inscriptionsResult.rowCount,
      deletedRealisations: realisationsResult.rowCount,
    });
  } catch (error) {
    await client.query("rollback");
    res.status(500).json({ error: error.message || "Suppression du grimpeur impossible" });
  } finally {
    client.release();
  }
});

/**
 * Sessions + inscriptions
 */
app.get("/sessions", requireAuth, async (_req, res) => {
  try {
    const sessionsResult = await pool.query(`
      select id, date, slot, status, encadrant_id, referent_id
      from sessions
      order by date asc, slot asc
    `);

    const inscriptionsResult = await pool.query(`
      select session_id, participant_id
      from session_participants
      order by session_id asc
    `);

    const participantIdsBySession = new Map();

    for (const inscription of inscriptionsResult.rows) {
      const list = participantIdsBySession.get(inscription.session_id) || [];
      list.push(String(inscription.participant_id));
      participantIdsBySession.set(inscription.session_id, list);
    }

    const sessions = sessionsResult.rows.map((session) =>
      sessionDbToApi(session, participantIdsBySession.get(session.id) || [])
    );

    res.json(sessions);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || String(error), fields: error.fields || undefined });
  }
});

app.put("/sessions/:id", requireAuth, async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      id,
      date,
      slot,
      status,
      encadrantId,
      referentId,
      participantIds,
    } = validateSessionPayload(req.body || {}, req.params.id);

    const resolvedStatus = status || defaultSessionStatus(date, slot);

    await client.query("begin");

    const sessionResult = await client.query(
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
        returning id, date, slot, status, encadrant_id, referent_id
      `,
      [id, date, slot, resolvedStatus, encadrantId || null, referentId || null]
    );

    const previousParticipantsResult = await client.query(
      `select participant_id from session_participants where session_id = $1`,
      [id]
    );
    const previousParticipantIds = new Set(
      previousParticipantsResult.rows.map((row) => String(row.participant_id))
    );

    await client.query("delete from session_participants where session_id = $1", [id]);

    const uniqueParticipantIds = [...new Set(participantIds.map(String))];
    const newlyAddedParticipantIds = uniqueParticipantIds.filter(
      (participantId) => !previousParticipantIds.has(participantId)
    );

    if (resolvedStatus === "libre" && newlyAddedParticipantIds.length) {
      const eligibleResult = await client.query(
        `select id from participants where id = any($1::bigint[]) and lower(passport) in ('jaune', 'orange', 'vert', 'bleu')`,
        [newlyAddedParticipantIds]
      );
      const eligibleIds = new Set(eligibleResult.rows.map((row) => String(row.id)));
      const ineligibleIds = newlyAddedParticipantIds.filter((participantId) => !eligibleIds.has(participantId));
      if (ineligibleIds.length) {
        await client.query("rollback");
        return res.status(400).json({
          error: "Une séance libre est réservée aux passeports Jaune, Orange, Vert ou Bleu pour toute nouvelle inscription.",
        });
      }
    }

    for (const participantId of uniqueParticipantIds) {
      await client.query(
        `
          insert into session_participants (session_id, participant_id)
          values ($1,$2)
          on conflict do nothing
        `,
        [id, participantId]
      );
    }

    await client.query("commit");

    res.json(sessionDbToApi(sessionResult.rows[0], uniqueParticipantIds));
  } catch (error) {
    await client.query("rollback");
    res.status(error.status || 500).json({ error: error.message || String(error), fields: error.fields || undefined });
  } finally {
    client.release();
  }
});

app.delete("/sessions/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("delete from sessions where id = $1", [id]);
    res.status(204).send();
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || String(error), fields: error.fields || undefined });
  }
});


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
async function importLegacyPayload(inputPayload) {
  const payload = validateLegacyImportPayload(inputPayload);

  const client = await pool.connect();
  try {
    await client.query("begin");

    await client.query("delete from session_participants");
    await client.query("delete from realisations");
    await client.query("delete from sessions");
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
          (nom, prenom, email, passport, cotisation, ffme, can_encadrer, can_referer, can_admin)
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          returning id
        `,
        [
          String(participant.nom || "").trim() || "?",
          String(participant.prenom || "").trim() || "?",
          String(participant.email || "").trim().toLowerCase(),
          String(participant.passport || "sans").trim() || "sans",
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
          String(route.id || `route-${route.numeroVoieUnique || Date.now()}`),
          String(route.numeroVoieUnique || route.id || ""),
          Number(route.numeroCorde),
          String(route.couleurPrises || ""),
          String(route.cotationReference || ""),
          String(route.cotationAjustee || route.cotationReference || ""),
          String(route.nomVoie || ""),
          String(route.nomOuvreur || ""),
          Boolean(route.moulinetteOnly),
          route.active !== false,
          String(route.dateCreation || ""),
        ]
      );
    }

    for (const session of payload.sessions || []) {
      const mappedEncadrantId = session.encadrantId ? participantIdMap.get(String(session.encadrantId)) || null : null;
      const mappedReferentId = session.referentId ? participantIdMap.get(String(session.referentId)) || null : null;

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
        [
          String(session.id),
          String(session.date || ""),
          String(session.slot || "midi"),
          String(session.status || "fermee"),
          mappedEncadrantId,
          mappedReferentId,
        ]
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
          [String(session.id), mappedParticipantId]
        );
      }
    }

    for (const realisation of payload.realisations || []) {
      const mappedParticipantId = participantIdMap.get(String(realisation.participantId));
      if (!mappedParticipantId) continue;

      await client.query(
        `
          insert into realisations (
            id, participant_id, session_id, voie_id, date_realisation, style_realisation,
            commentaire, cotation_proposee, nb_essais
          ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          on conflict (id) do update set
            participant_id = excluded.participant_id,
            session_id = excluded.session_id,
            voie_id = excluded.voie_id,
            date_realisation = excluded.date_realisation,
            style_realisation = excluded.style_realisation,
            commentaire = excluded.commentaire,
            cotation_proposee = excluded.cotation_proposee,
            nb_essais = excluded.nb_essais,
            updated_at = now()
        `,
        [
          String(realisation.id || `real-${Date.now()}-${Math.random().toString(16).slice(2)}`),
          mappedParticipantId,
          String(realisation.sessionId || ""),
          String(realisation.voieId || ""),
          String(realisation.dateRealisation || ""),
          String(realisation.styleRealisation || ""),
          realisation.commentaire || "",
          realisation.cotationProposee || "",
          realisation.nbEssais || "",
        ]
      );
    }

    await client.query("commit");

    return {
      ok: true,
      message: "Import legacy terminé",
      participantsImported: payload.participants?.length || 0,
      sessionsImported: payload.sessions?.length || 0,
      ropesImported: payload.ropes?.length || 0,
      routesImported: payload.routes?.length || 0,
      realisationsImported: payload.realisations?.length || 0,
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function exportLegacyPayload() {
  const [participantsResult, ropesResult, routesResult, sessionsResult, sessionParticipantsResult, realisationsResult] = await Promise.all([
    pool.query(`select * from participants order by nom asc, prenom asc, id asc`),
    pool.query(`select * from ropes order by numero_corde asc`),
    pool.query(`select * from routes order by numero_corde asc nulls last, numero_voie_unique asc`),
    pool.query(`select * from sessions order by date asc, slot asc`),
    pool.query(`select session_id, participant_id from session_participants order by session_id asc, participant_id asc`),
    pool.query(`select * from realisations order by date_realisation asc, created_at asc`),
  ]);

  const participantByDbId = new Map();
  const participants = participantsResult.rows.map((row, index) => {
    const legacyId = `p${index + 1}`;
    participantByDbId.set(String(row.id), legacyId);
    return {
      id: legacyId,
      nom: row.nom,
      prenom: row.prenom,
      passport: row.passport,
      cotisation: row.cotisation,
      ffme: row.ffme,
      canEncadrer: row.can_encadrer,
      canReferer: row.can_referer,
      canAdmin: row.can_admin,
    };
  });

  const participantsBySession = new Map();
  for (const row of sessionParticipantsResult.rows) {
    const participantId = participantByDbId.get(String(row.participant_id));
    if (!participantId) continue;
    const list = participantsBySession.get(row.session_id) || [];
    list.push(participantId);
    participantsBySession.set(row.session_id, list);
  }

  return {
    exportedAt: new Date().toISOString(),
    version: "climbcrew-api-export-v1",
    participants,
    sessions: sessionsResult.rows.map((row) => ({
      id: row.id,
      date: row.date,
      slot: row.slot,
      status: row.status,
      encadrantId: row.encadrant_id ? participantByDbId.get(String(row.encadrant_id)) || null : null,
      referentId: row.referent_id ? participantByDbId.get(String(row.referent_id)) || null : null,
      participantIds: participantsBySession.get(row.id) || [],
    })),
    ropes: ropesResult.rows.map(ropeDbToApi),
    routes: routesResult.rows.map(routeDbToApi),
    realisations: realisationsResult.rows.map((row) => ({
      id: row.id,
      participantId: participantByDbId.get(String(row.participant_id)) || String(row.participant_id),
      sessionId: row.session_id,
      voieId: row.voie_id,
      dateRealisation: row.date_realisation,
      styleRealisation: row.style_realisation,
      commentaire: row.commentaire || "",
      cotationProposee: row.cotation_proposee || "",
      nbEssais: row.nb_essais || "",
    })),
    selectedDate: new Date().toISOString().slice(0, 10),
    selectedParticipantProgress: participants[0]?.id || "",
  };
}

app.post("/admin/import-data", requireAuth, requireAdmin, async (req, res) => {
  try {
    const summary = await importLegacyPayload(req.body);
    res.json(summary);
  } catch (error) {
    console.error("POST /admin/import-data", error);
    res.status(error.status || 500).json({ error: error.message || String(error) });
  }
});

app.get("/admin/export-data", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const data = await exportLegacyPayload();
    res.json({ ok: true, data });
  } catch (error) {
    console.error("GET /admin/export-data", error);
    res.status(500).json({ error: error.message || String(error) });
  }
});

/**
 * Import des données transformées, si le fichier existe.
 */
app.post("/import-data", requireSetupAccess, async (req, res) => {
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
          (nom, prenom, email, passport, cotisation, ffme, can_encadrer, can_referer, can_admin)
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          returning id
        `,
        [
          participant.nom,
          participant.prenom,
          String(participant.email || "").trim().toLowerCase(),
          participant.passport || "sans",
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
  await ensureDefaultAdmin();
  await cleanupExpiredSecurityData();

  app.listen(PORT, () => {
    console.log(`ClimbCrew API listening on port ${PORT}`);
  });
}

start().catch((error) => {
  console.error("Erreur au démarrage :", error);
  process.exit(1);
});
