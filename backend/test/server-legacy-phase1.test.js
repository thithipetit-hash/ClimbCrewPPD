import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const serverSource = await readFile(new URL("../server.js", import.meta.url), "utf8");
const explicitRoutesSource = await readFile(new URL("../admin-users/explicit-routes.js", import.meta.url), "utf8");
const routeManagementSource = await readFile(new URL("../route-management-routes.js", import.meta.url), "utf8");
const realisationManagementSource = await readFile(new URL("../realisation-management-routes.js", import.meta.url), "utf8");
const sessionReadSource = await readFile(new URL("../session-read-routes.js", import.meta.url), "utf8");
const participantCreationSource = await readFile(new URL("../participant-creation-route.js", import.meta.url), "utf8");
const broadcastMessageSource = await readFile(new URL("../broadcast-message-routes.js", import.meta.url), "utf8");
const evolutionRequestSource = await readFile(new URL("../evolution-request-routes.js", import.meta.url), "utf8");

test("server.js ne conserve plus de points d'ancrage legacy pour les contrôleurs remplacés", () => {
  assert.doesNotMatch(serverSource, /legacyReplacedRoute/);
  assert.match(serverSource, /installExplicitAdminUserRoutes\(app/);
  for (const route of [
    "/admin/import-data", "/admin/export-data", "/realisations", "/health",
    "/auth/login", "/auth/request-access", "/auth/forgot-password", "/auth/reset-password",
    "/admin/auth/users", "/participants", "/participants/me/profile", "/sessions/:id",
  ]) {
    assert.ok(explicitRoutesSource.includes(`\"${route}\"`), `route explicite absente: ${route}`);
  }
});

test("les anciennes implémentations remplacées ne reviennent pas dans server.js", () => {
  const forbiddenFragments = [
    "async function importLegacyPayload",
    "async function exportLegacyPayload",
    "findParticipantId(prenom, nom)",
    'eventType: "login_success"',
    'message: "Demande d’accès enregistrée. Un administrateur doit l’approuver."',
    'const customAvatarImage = String(req.body?.customAvatarImage || "");',
    "sendApprovalNotificationEmail",
    'app.post("/participants", requireAuth, requireAdmin, async',
    "function participantDbToApi(row)",
    'app.post("/realisations", requireAuth, async',
    'app.put("/realisations/:id", requireAuth, async',
    'app.delete("/realisations/:id", requireAuth, async',
    'app.get("/sessions", requireAuth, async',
    'app.delete("/sessions/:id", requireAuth, requireAdmin, async',
    "function sessionDbToApi(row, participantIds = [])",
  ];
  for (const fragment of forbiddenFragments) {
    assert.equal(serverSource.includes(fragment), false, `fragment legacy revenu: ${fragment}`);
  }
});

test("les routes actives restent implémentées dans des modules explicites", () => {
  assert.match(serverSource, /installEvolutionRequestRoutes\(app, \{ requireAuth, requireAdmin, pool \}\)/);
  assert.match(evolutionRequestSource, /app\.get\("\/evolution-requests", requireAuth, async/);
  assert.match(evolutionRequestSource, /app\.post\("\/evolution-requests", requireAuth, async/);
  assert.match(evolutionRequestSource, /app\.put\("\/evolution-requests\/:id\/vote", requireAuth, async/);
  assert.match(evolutionRequestSource, /app\.post\("\/evolution-requests\/:id\/comments", requireAuth, async/);
  assert.match(evolutionRequestSource, /app\.put\("\/admin\/evolution-requests\/:id\/status", requireAuth, requireAdmin, async/);

  assert.match(serverSource, /installBroadcastMessageRoutes\(app, \{ requireAuth, requireAdmin, pool \}\)/);
  assert.match(broadcastMessageSource, /app\.post\("\/admin\/broadcast-messages", requireAuth, requireAdmin, async/);
  assert.match(broadcastMessageSource, /app\.get\("\/auth\/broadcast-messages\/pending", requireAuth, async/);
  assert.match(broadcastMessageSource, /app\.post\("\/auth\/broadcast-messages\/:id\/read", requireAuth, async/);

  assert.match(serverSource, /installParticipantCreationRoute\(app, \{ requireAuth, requireAdmin, pool \}\)/);
  assert.match(participantCreationSource, /app\.post\("\/participants", requireAuth, requireAdmin, async/);
  assert.match(participantCreationSource, /validateParticipantPayload/);

  assert.match(serverSource, /installSessionReadRoutes\(app, \{ requireAuth, requireAdmin, pool \}\)/);
  assert.match(sessionReadSource, /app\.get\("\/sessions", requireAuth, async/);
  assert.match(sessionReadSource, /app\.delete\("\/sessions\/:id", requireAuth, requireAdmin, async/);

  assert.match(serverSource, /installRealisationManagementRoutes\(app, \{ requireAuth, pool \}\)/);
  assert.match(realisationManagementSource, /app\.post\("\/realisations", requireAuth, async/);
  assert.match(realisationManagementSource, /app\.put\("\/realisations\/:id", requireAuth, async/);
  assert.match(realisationManagementSource, /app\.delete\("\/realisations\/:id", requireAuth, async/);

  assert.match(serverSource, /installRouteManagementRoutes\(app, \{ requireAuth, requireAdmin, pool \}\)/);
  assert.match(routeManagementSource, /app\.get\("\/ropes", requireAuth, async/);
  assert.match(routeManagementSource, /app\.get\("\/routes", requireAuth, async/);
  assert.match(routeManagementSource, /app\.post\("\/routes", requireAuth, requireAdmin, async/);
  assert.match(routeManagementSource, /app\.put\("\/routes\/:id", requireAuth, requireAdmin, async/);
  assert.match(routeManagementSource, /app\.delete\("\/routes\/:id", requireAuth, requireAdmin, async/);
});
