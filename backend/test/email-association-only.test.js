import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const associationSource = await readFile(new URL("../admin-users/email-association-service.js", import.meta.url), "utf8");
const approvalSource = await readFile(new URL("../admin-users/account-approval-flow-service.js", import.meta.url), "utf8");
const routesSource = await readFile(new URL("../admin-users/explicit-routes.js", import.meta.url), "utf8");
const participantAdminRightSource = await readFile(
  new URL("../admin-users/participant-admin-right-service.js", import.meta.url),
  "utf8",
);

test("la demande de compte ne branche aucune association automatique", () => {
  assert.match(routesSource, /app\.post\("\/auth\/request-access", authRateLimit, requestAccessByEmailOnly\)/);
  assert.doesNotMatch(routesSource, /associations\/auto/);
  assert.doesNotMatch(routesSource, /associateExistingAccountsByEmail/);
});

test("la vérification email ne crée ni n'associe automatiquement de participant", () => {
  assert.doesNotMatch(approvalSource, /insert into participants/i);
  assert.doesNotMatch(approvalSource, /ensureParticipantAfterEmailVerification/);
  assert.doesNotMatch(approvalSource, /findParticipantByEmailOnly/);
  assert.doesNotMatch(approvalSource, /\bautoActivate\b/);
  assert.match(approvalSource, /set email_verified_at = coalesce/);
});

test("l'association manuelle administrateur reste disponible", () => {
  assert.match(routesSource, /app\.put\("\/admin\/auth\/users\/:id\/participant", requireAuth, requireAdmin, setAccountParticipantAssociation\)/);
});

test("aucun ancien rattrapage automatique n'est conservé", () => {
  assert.doesNotMatch(associationSource, /associateExistingAccountsByEmail/);
  assert.doesNotMatch(associationSource, /byName:\s*0/);
  assert.doesNotMatch(associationSource, /update participants set login_email = \$2 where id = \$1/);
});

test("un compte pending doit confirmer son e-mail avant association manuelle", () => {
  assert.match(participantAdminRightSource, /user\.status === "pending" && !user\.email_verified_at/);
  assert.match(participantAdminRightSource, /doit être confirmée avant d’associer ce compte/);
});
