import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const lifecycleSource = await readFile(new URL("../admin-users/account-lifecycle-service.js", import.meta.url), "utf8");
const participantLifecycleSource = await readFile(new URL("../admin-users/participant-lifecycle-service.js", import.meta.url), "utf8");
const routesSource = await readFile(new URL("../admin-users/explicit-routes.js", import.meta.url), "utf8");
const deploymentSource = await readFile(new URL("../deployment-compatibility.js", import.meta.url), "utf8");
const productionEnvExample = await readFile(new URL("../../.env.production.example", import.meta.url), "utf8");

test("la révocation utilise explicitement le contrôleur avec garde-fous", () => {
  assert.match(routesSource, /app\.post\("\/admin\/auth\/users\/:id\/revoke", requireAuth, requireAdmin, revokeAccountSafely\)/);
});

test("un administrateur ne peut pas révoquer son propre compte", () => {
  assert.match(lifecycleSource, /currentActorId === userId/);
  assert.match(lifecycleSource, /Vous ne pouvez pas révoquer votre propre compte administrateur/);
});

test("le dernier administrateur actif ne peut pas être révoqué", () => {
  assert.match(lifecycleSource, /status = 'active'/);
  assert.match(lifecycleSource, /role = 'admin' or is_admin = true/);
  assert.match(lifecycleSource, /hasAnotherActiveAdmin/);
  assert.match(lifecycleSource, /Le dernier compte administrateur actif ne peut pas être révoqué/);
});

test("la révocation coupe les sessions et les notifications du compte", () => {
  assert.match(lifecycleSource, /receive_account_notifications = false/);
  assert.match(lifecycleSource, /update user_sessions set revoked_at = now\(\)/);
});

test("la réactivation recalcule le rôle depuis la fiche participant", () => {
  assert.match(routesSource, /app\.post\("\/admin\/auth\/users\/:id\/reactivate", requireAuth, requireAdmin, reactivateAccountSafely\)/);
  assert.match(lifecycleSource, /select id, can_admin from participants where id = \$1 for update/);
  assert.match(lifecycleSource, /role = case when \$2 then 'admin' else 'user' end/);
  assert.match(lifecycleSource, /receive_account_notifications = false/);
});

test("un compte sans fiche ne peut pas être promu administrateur", () => {
  assert.match(lifecycleSource, /typeof isAdmin !== "boolean"/);
  assert.match(lifecycleSource, /isAdmin && !target\.participant_id/);
  assert.match(lifecycleSource, /Associez d’abord ce compte à une fiche participant/);
  assert.match(routesSource, /app\.post\("\/admin\/auth\/users\/:id\/admin", requireEnhancementAdmin, updateAdminRightSafely\)/);
});

test("supprimer une fiche liée à un compte est refusé", () => {
  assert.match(routesSource, /app\.delete\("\/participants\/:id", requireAuth, requireAdmin, deleteParticipantSafely\)/);
  assert.match(participantLifecycleSource, /from users where participant_id = \$1/);
  assert.match(participantLifecycleSource, /Dissociez ou supprimez d’abord le compte/);
});

test("la suppression nettoie les références d'assureur orphelines", () => {
  assert.match(participantLifecycleSource, /update realisations set assureur_id = null where assureur_id = \$1/);
  assert.match(participantLifecycleSource, /clearedAssurerReferences/);
});

test("le bootstrap FIRST_ADMIN est explicitement désactivé par défaut en production", () => {
  assert.match(deploymentSource, /ALLOW_FIRST_ADMIN_BOOTSTRAP/);
  assert.match(deploymentSource, /delete process\.env\.FIRST_ADMIN_PASSWORD/);
  assert.match(productionEnvExample, /ALLOW_FIRST_ADMIN_BOOTSTRAP=false/);
});
