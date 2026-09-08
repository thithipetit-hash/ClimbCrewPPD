import "dotenv/config";
import express from "express";
import { installRouteManagementRoutes } from "./route-management-routes.js";
import { installRealisationManagementRoutes } from "./realisation-management-routes.js";
import { installRealisationTechnicalAnalysisRoutes } from "./realisation-technical-analysis-routes.js";
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
installRealisationTechnicalAnalysisRoutes(app, { requireAuth, pool });
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
