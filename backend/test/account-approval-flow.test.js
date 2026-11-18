import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const approvalSource = await readFile(
  new URL("../admin-users/account-approval-flow-service.js", import.meta.url),
  "utf8",
);
const emailAssociationSource = await readFile(
  new URL("../admin-users/email-association-service.js", import.meta.url),
  "utf8",
);
const routesSource = await readFile(
  new URL("../admin-users/explicit-routes.js", import.meta.url),
  "utf8",
);
const accountSource = await readFile(
  new URL("../admin-users/account-service.js", import.meta.url),
  "utf8",
);
const configSource = await readFile(
  new URL("../admin-users/config.js", import.meta.url),
  "utf8",
);

test("la demande de compte annonce une association administrateur explicite", () => {
  assert.doesNotMatch(configSource, /REQUIRE_ADMIN_ACCOUNT_APPROVAL/);
  assert.match(configSource, /ACCOUNT_REQUEST_NOTIFICATION_RECIPIENTS/);
  assert.match(emailAssociationSource, /un administrateur devra associer le compte/);
  assert.match(emailAssociationSource, /publicRequestResponse/);
  assert.match(routesSource, /requestAccessByEmailOnly/);
});

test("la vérification de l'adresse ne crée ni n'associe automatiquement de participant", () => {
  assert.doesNotMatch(emailAssociationSource, /insert into participants/i);
  assert.doesNotMatch(approvalSource, /insert into participants/i);
  assert.doesNotMatch(approvalSource, /ensureParticipantAfterEmailVerification/);
  assert.doesNotMatch(routesSource, /associations\/auto/);
  assert.match(routesSource, /users\/:id\/participant/);
});

test("l'association automatique par email n'est plus exposée", () => {
  assert.doesNotMatch(emailAssociationSource, /associateExistingAccountsByEmail/);
  assert.doesNotMatch(routesSource, /associateExistingAccountsByEmail/);
});

test("la vérification de l'e-mail conserve le compte pending jusqu'à l'action administrateur", () => {
  assert.doesNotMatch(approvalSource, /\bautoActivate\b/);
  assert.match(approvalSource, /Un administrateur doit maintenant associer le compte/);
  assert.match(routesSource, /app\.get\("\/auth\/verify-email", showVerifyEmailConfirmation\)/);
  assert.match(routesSource, /app\.post\("\/auth\/verify-email", verifyEmailPendingAdminApproval\)/);
});

test("un compte pending déjà vérifié reste pending jusqu'à l'approbation administrateur", () => {
  assert.match(approvalSource, /if \(tokenRow\.used_at\)/);
  assert.match(approvalSource, /tokenRow\.status === "active"/);
  assert.match(approvalSource, /compte reste en attente d’association et d’approbation/);
  assert.doesNotMatch(approvalSource, /status = case when/);
});

test("la confirmation e-mail conserve le diagnostic de réponse sans logs temporaires et protège le succès après commit", () => {
  assert.doesNotMatch(approvalSource, /account_email_verification_trace/);
  assert.doesNotMatch(approvalSource, /account_email_verification_error/);
  assert.match(approvalSource, /requestDiagnosticStage/);
  assert.match(approvalSource, /transactionCommitted = true/);
  assert.match(approvalSource, /admin_notification/);
  assert.match(approvalSource, /client\?\.release\(\)/);
});

test("toutes les demandes pending restent visibles dans Gestion des comptes avec leur statut d'envoi", () => {
  assert.match(accountSource, /from users u/);
  assert.doesNotMatch(accountSource, /where status <> 'pending'/);
  assert.match(accountSource, /confirmation_email_event/);
  assert.match(accountSource, /account_request_confirmation_email_sent/);
  assert.match(accountSource, /account_request_confirmation_email_skipped/);
  assert.match(accountSource, /account_request_confirmation_email_failed/);
  assert.doesNotMatch(accountSource, /thithi\.petit@gmail\.com|fabien\.alcouffe@thalesgroup\.com/);
});

test("l'approbation manuelle reste disponible pour une régularisation exceptionnelle", () => {
  assert.match(approvalSource, /if \(!target\.email_verified_at\)/);
  assert.match(approvalSource, /if \(!target\.participant_id\)/);
  assert.match(approvalSource, /if \(target\.status !== "pending"\)/);
  assert.match(approvalSource, /set status = 'active'/);
  assert.match(approvalSource, /eventType: "account_approved"/);
  assert.match(routesSource, /app\.post\("\/admin\/auth\/users\/:id\/approve", requireAuth, requireAdmin, approveVerifiedAccountWithParticipantRole\)/);
});
