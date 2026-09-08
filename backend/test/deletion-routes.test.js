import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("les suppressions administratives sont protégées et transactionnelles", async () => {
  const [server, routeManagement, accountDelete, explicitRoutes, participantLifecycle] = await Promise.all([
    readFile(new URL("../server.js", import.meta.url), "utf8"),
    readFile(new URL("../route-management-routes.js", import.meta.url), "utf8"),
    readFile(new URL("../admin-account-delete-route.js", import.meta.url), "utf8"),
    readFile(new URL("../admin-users/explicit-routes.js", import.meta.url), "utf8"),
    readFile(new URL("../admin-users/participant-lifecycle-service.js", import.meta.url), "utf8"),
  ]);

  assert.match(server, /installRouteManagementRoutes\(app, \{ requireAuth, requireAdmin, pool \}\)/);
  assert.match(routeManagement, /app\.delete\("\/routes\/:id", requireAuth, requireAdmin/);
  assert.match(routeManagement, /delete from realisations where voie_id = \$1/);
  assert.match(routeManagement, /await client\.query\("commit"\)/);
  assert.match(routeManagement, /await client\.query\("rollback"\)/);

  assert.match(server, /installAdminAccountDeleteRoute\(app, \{ requireAuth, requireAdmin, pool, logAccess \}\)/);
  assert.match(accountDelete, /app\.delete\("\/admin\/auth\/users\/:id", requireAuth, requireAdmin/);
  assert.match(accountDelete, /Vous ne pouvez pas supprimer votre propre compte/);
  assert.match(accountDelete, /Le dernier compte administrateur actif ne peut pas être supprimé/);
  assert.match(accountDelete, /select id, email, role, status from users where id = \$1 for update/);
  assert.match(accountDelete, /await client\.query\("commit"\)/);
  assert.match(accountDelete, /await client\.query\("rollback"\)/);

  assert.match(explicitRoutes, /app\.delete\("\/participants\/:id", requireAuth, requireAdmin, deleteParticipantSafely\)/);
  assert.match(participantLifecycle, /select id, email, status, role, is_admin from users where participant_id = \$1/);
  assert.match(participantLifecycle, /delete from session_participants where participant_id = \$1/);
  assert.match(participantLifecycle, /update realisations set assureur_id = null where assureur_id = \$1/);
  assert.match(participantLifecycle, /delete from realisations where participant_id = \$1/);
  assert.match(participantLifecycle, /await client\.query\("commit"\)/);
  assert.match(participantLifecycle, /await client\.query\("rollback"\)/);
});
