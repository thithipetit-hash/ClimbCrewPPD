import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import bcrypt from "bcryptjs";
import pg from "pg";
import { purgeExpiredSecurityData } from "../admin-users/security-retention-service.js";

const { Pool } = pg;
const PORT = Number(process.env.PORT || 3100);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) throw new Error("DATABASE_URL est requis pour le test d'intégration");

const pool = new Pool({ connectionString: DATABASE_URL });
const server = spawn(
  process.execPath,
  ["--import", "./deployment-bootstrap.js", "server.js"],
  {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  },
);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer() {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    try {
      const response = await fetch(`${BASE_URL}/health`);
      if (response.ok) return;
    } catch {
      // Le serveur n'écoute pas encore.
    }
    if (server.exitCode !== null) {
      throw new Error(`Le backend s'est arrêté avant le test (code ${server.exitCode})`);
    }
    await sleep(500);
  }
  throw new Error("Le backend d'intégration n'a pas démarré");
}

function sessionCookies(response) {
  const values = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [];
  if (!values.length) throw new Error("Cookies de session absents de la réponse de connexion");
  return values.map((value) => value.split(";", 1)[0]).join("; ");
}

function cookieValue(cookieHeader, name) {
  const entry = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : "";
}

async function jsonRequest(path, {
  method = "GET",
  body,
  cookies = "",
  csrf = "",
} = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookies) headers.Cookie = cookies;
  if (csrf) headers["X-CSRF-Token"] = csrf;
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  return { response, payload };
}

async function login(email, password) {
  const { response, payload } = await jsonRequest("/auth/login", {
    method: "POST",
    body: { email, password },
  });
  assert.equal(response.status, 200, `connexion impossible pour ${email}: ${JSON.stringify(payload)}`);
  const cookies = sessionCookies(response);
  const csrf = cookieValue(cookies, "climbcrew_csrf");
  assert.ok(csrf, "cookie CSRF absent après connexion");
  return { cookies, csrf, user: payload.user };
}

async function run() {
  await waitForServer();

  const adminEmail = process.env.FIRST_ADMIN_EMAIL;
  const adminPassword = process.env.FIRST_ADMIN_PASSWORD;
  const admin = await login(adminEmail, adminPassword);

  const memberEmail = `member-${Date.now()}@integration.test`;
  const createParticipant = await jsonRequest("/participants", {
    method: "POST",
    cookies: admin.cookies,
    csrf: admin.csrf,
    body: {
      nom: "Membre",
      prenom: "Integration",
      email: memberEmail,
      passport: "jaune",
      sexe: "f",
      cotisation: true,
      ffme: true,
      canEncadrer: false,
      canReferer: false,
      canAdmin: false,
      avatarId: "gecko",
      crestId: "cristal",
      profilePublic: false,
    },
  });
  assert.equal(createParticipant.response.status, 201, JSON.stringify(createParticipant.payload));
  const participantId = String(createParticipant.payload.id);

  const memberPassword = "Member_Integration1!";
  const memberHash = await bcrypt.hash(memberPassword, 10);
  await pool.query(
    `
      insert into users (
        participant_id, email, prenom, nom, password_hash,
        role, is_admin, status, approved_at, email_verified_at
      ) values ($1,$2,'Integration','Membre',$3,'user',false,'active',now(),now())
    `,
    [participantId, memberEmail, memberHash],
  );
  const member = await login(memberEmail, memberPassword);

  // Régression profil : une modification partielle ne doit jamais réinitialiser
  // un sexe ou une confidentialité déjà enregistrés.
  const patchProfile = await jsonRequest("/participants/me/profile", {
    method: "PATCH",
    cookies: member.cookies,
    csrf: member.csrf,
    body: { avatarId: "lynx" },
  });
  assert.equal(patchProfile.response.status, 200, JSON.stringify(patchProfile.payload));
  const persistedProfile = await pool.query(
    `select sexe, profile_public, avatar_id from participants where id = $1`,
    [participantId],
  );
  assert.equal(persistedProfile.rowCount, 1);
  assert.equal(persistedProfile.rows[0].sexe, "f", "le PATCH partiel a modifié le sexe");
  assert.equal(persistedProfile.rows[0].profile_public, false, "le PATCH partiel a rendu le profil public");
  assert.equal(persistedProfile.rows[0].avatar_id, "lynx", "le champ explicitement modifié n'a pas été persisté");

  const sessionId = `closed-${Date.now()}`;
  const sessionPayload = {
    id: sessionId,
    date: "2026-08-24",
    slot: "soir",
    status: "fermee",
    encadrantId: null,
    referentId: null,
    participantIds: [],
  };
  const createSession = await jsonRequest(`/sessions/${sessionId}`, {
    method: "PUT",
    cookies: admin.cookies,
    csrf: admin.csrf,
    body: sessionPayload,
  });
  assert.equal(createSession.response.status, 200, JSON.stringify(createSession.payload));

  const closedJoin = await jsonRequest(`/sessions/${sessionId}`, {
    method: "PUT",
    cookies: member.cookies,
    csrf: member.csrf,
    body: { ...sessionPayload, participantIds: [participantId] },
  });
  assert.equal(closedJoin.response.status, 409, "une séance fermée a accepté une inscription directe API");
  const closedRows = await pool.query(
    `select 1 from session_participants where session_id = $1 and participant_id = $2`,
    [sessionId, participantId],
  );
  assert.equal(closedRows.rowCount, 0, "l'inscription refusée a malgré tout été persistée");

  const unverifiedEmail = `unverified-${Date.now()}@integration.test`;
  const requestAccess = await jsonRequest("/auth/request-access", {
    method: "POST",
    body: {
      prenom: "Non",
      nom: "Verifie",
      email: unverifiedEmail,
      password: "Unverified_Test1!",
      acceptTerms: true,
    },
  });
  assert.equal(requestAccess.response.status, 200, JSON.stringify(requestAccess.payload));
  const pendingUser = await pool.query(
    `select id, participant_id, status from users where lower(email) = lower($1)`,
    [unverifiedEmail],
  );
  assert.equal(pendingUser.rowCount, 1);
  assert.equal(pendingUser.rows[0].status, "pending");
  assert.equal(pendingUser.rows[0].participant_id, null, "une fiche a été associée avant vérification e-mail");
  const prematureParticipant = await pool.query(
    `select id from participants where lower(trim(coalesce(login_email, email, ''))) = lower($1)`,
    [unverifiedEmail],
  );
  assert.equal(prematureParticipant.rowCount, 0, "une fiche participant a été créée avant vérification e-mail");

  const staleEmail = `stale-${Date.now()}@integration.test`;
  const oldTimestamp = "2026-08-10T10:00:00.000Z";
  const staleParticipant = await pool.query(
    `
      insert into participants (
        nom, prenom, email, login_email, passport, cotisation, ffme,
        can_encadrer, can_referer, can_admin, avatar_id, crest_id,
        profile_public, custom_avatar_image, created_at
      ) values ('Obsolete','Auto',$1,$1,'sans',false,false,false,false,false,'gecko','cristal',true,'',$2)
      returning id
    `,
    [staleEmail, oldTimestamp],
  );
  const stalePassword = await bcrypt.hash("Stale_Integration1!", 10);
  const staleUser = await pool.query(
    `
      insert into users (
        participant_id, email, prenom, nom, password_hash,
        role, is_admin, status, created_at
      ) values ($1,$2,'Auto','Obsolete',$3,'user',false,'pending',$4)
      returning id
    `,
    [staleParticipant.rows[0].id, staleEmail, stalePassword, oldTimestamp],
  );
  await pool.query(
    `insert into email_verification_tokens (user_id, token_hash, created_at, expires_at)
     values ($1, $2, $3, $4)`,
    [staleUser.rows[0].id, `stale-token-${Date.now()}`, oldTimestamp, "2026-08-17T10:00:00.000Z"],
  );

  await pool.query(
    `insert into user_sessions (user_id, token_hash, created_at, expires_at, revoked_at)
     values ((select id from users where lower(email)=lower($1)), $2, '2026-07-01T10:00:00Z', '2026-07-08T10:00:00Z', null)`,
    [memberEmail, `old-session-${Date.now()}`],
  );

  const purge = await purgeExpiredSecurityData({
    pool,
    config: {
      unverifiedAccountDays: 8,
      tokenDays: 7,
      sessionDays: 30,
    },
  });
  assert.ok(purge.deletedUnverifiedAccounts >= 1, "le compte pending obsolète n'a pas été purgé");
  assert.ok(purge.deletedHistoricalParticipants >= 1, "la fiche minimale historique n'a pas été purgée");
  assert.ok(purge.deletedSessions >= 1, "la session expirée ancienne n'a pas été purgée");

  const staleUserAfter = await pool.query(`select id from users where lower(email)=lower($1)`, [staleEmail]);
  const staleParticipantAfter = await pool.query(`select id from participants where id=$1`, [staleParticipant.rows[0].id]);
  assert.equal(staleUserAfter.rowCount, 0);
  assert.equal(staleParticipantAfter.rowCount, 0);

  console.log("Intégration sécurité ClimbCrew : OK");
}

try {
  await run();
} finally {
  server.kill("SIGTERM");
  await pool.end().catch(() => undefined);
}
