import "dotenv/config";
import express from "express";
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
import { runDatabaseMigrations } from "./database/migrate.js";
import {
  installExplicitAdminUserRoutes,
  initializeAdminUserEnhancements,
  startAdminUserSchedulers,
} from "./admin-users/explicit-routes.js";
import { blockLegacyFileImportInProduction } from "./admin-users/maintenance-hardening.js";
import { createRuntimeConfig, createDatabasePool } from "./config/runtime-config.js";
import { installHttpStack } from "./middleware/http-stack.js";
import {
  nowPlus,
  hashToken,
  randomToken,
  cleanEmail,
  getCookie,
  createRequestTokenReader,
  isSafeMethod,
  constantTimeEqual,
  createCookieWriters,
  isStrongPassword,
  serializeUser,
  getClientIp,
} from "./security/runtime-helpers.js";
import {
  createDefaultAdminInitializer,
  startApplication,
} from "./bootstrap/application-bootstrap.js";

const config = createRuntimeConfig();
const pool = createDatabasePool(config);
const app = express();

const getRequestToken = createRequestTokenReader(config.sessionCookieName);
const { setCsrfCookie, clearSessionCookie } = createCookieWriters(config);
const { authRateLimit, resetRateLimit } = installHttpStack(app, config, {
  isSafeMethod,
  getClientIp,
});

function requireSetupAccess(req, res, next) {
  if (req.query.setupToken || req.query.token) {
    return res.status(400).json({
      ok: false,
      error: "Le jeton de maintenance doit être transmis uniquement dans l’en-tête X-Setup-Token.",
    });
  }

  const providedToken = req.headers["x-setup-token"];
  if (!config.setupToken) {
    return res.status(503).json({
      ok: false,
      error: "SETUP_TOKEN n'est pas configuré côté serveur. Ajoute cette variable d'environnement avant d'utiliser cette route.",
    });
  }
  if (!constantTimeEqual(providedToken, config.setupToken)) {
    return res.status(403).json({ ok: false, error: "Jeton de maintenance invalide" });
  }
  next();
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

const ensureDefaultAdmin = createDefaultAdminInitializer({
  pool,
  config,
  cleanEmail,
  isStrongPassword,
});

const { requireAuth, requireAdmin } = createAuthMiddleware({
  pool,
  hashToken,
  getRequestToken,
  isSafeMethod,
  getCookie,
  csrfCookieName: config.csrfCookieName,
  constantTimeEqual,
  serializeUser,
});

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
  runMigrations: () => runDatabaseMigrations(pool),
  ensureDefaultAdmin,
  pool,
  firstAdminEmail: config.firstAdminEmail,
});

installAuthSessionRoutes(app, {
  requireAuth,
  pool,
  randomToken,
  nowPlus,
  sessionDurationMs: config.sessionDurationMs,
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
 * L'import remplace les données métier legacy sans supprimer les comptes utilisateurs.
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

startApplication({
  app,
  pool,
  port: config.port,
  initializeAdminUserEnhancements,
  ensureDefaultAdmin,
  startAdminUserSchedulers,
}).catch((error) => {
  console.error("Erreur au démarrage :", error);
  process.exit(1);
});
