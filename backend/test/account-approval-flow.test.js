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
const integrationSource = await readFile(
  new URL("../admin-users/express-integration.js", import.meta.url),
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

test("l'approbation administrateur est désactivée par défaut et reste configurable", () => {
  assert.match(configSource, /REQUIRE_ADMIN_ACCOUNT_APPROVAL/);
  assert.match(configSource, /"REQUIRE_ADMIN_ACCOUNT_APPROVAL",\s*false/);
  assert.match(emailAssociationSource, /le compte sera activé automatiquement/);
  assert.match(emailAssociationSource, /publicRequestResponse/);
  assert.match(integrationSource, /requestAccessByEmailOnly/);
});

test("une nouvelle fiche participant n'est créée qu'après vérification de l'adresse", () => {
  assert.doesNotMatch(emailAssociationSource, /insert into participants/i);
  assert.match(emailAssociationSource, /associationDeferredUntilEmailVerified/);
  assert.match(approvalSource, /ensureParticipantAfterEmailVerification/);
  assert.match(approvalSource, /insert into participants/i);
  assert.match(approvalSource, /can_encadrer, can_referer, can_admin/);
});

test("l'association à une fiche est tentée à la vérification même si l'approbation manuelle est requise", () => {
  assert.doesNotMatch(
    approvalSource,
    /if \(!REQUIRE_ADMIN_ACCOUNT_APPROVAL && tokenRow\.status === "pending"\) \{\s*participant = await ensureParticipantAfterEmailVerification/,
  );
  assert.match(
    approvalSource,
    /if \(tokenRow\.status === "pending"\) \{\s*participant = await ensureParticipantAfterEmailVerification/,
  );
});

test("la vérification de l'e-mail active automatiquement un compte pending associé", () => {
  assert.match(approvalSource, /autoActivate/);
  assert.match(approvalSource, /status = case when \$2 then 'active' else status end/);
  assert.match(approvalSource, /approved_at = case when \$2 then coalesce\(approved_at, now\(\)\)/);
  assert.match(approvalSource, /account_request_email_verified_auto_activated/);
  assert.match(approvalSource, /Votre compte est maintenant actif/);
  assert.match(integrationSource, /verifyEmailPendingAdminApproval/);
});

test("un compte pending déjà vérifié peut être activé après changement de politique", () => {
  assert.match(approvalSource, /if \(tokenRow\.used_at && tokenRow\.status === "active"\)/);
  assert.match(approvalSource, /if \(tokenRow\.used_at && REQUIRE_ADMIN_ACCOUNT_APPROVAL\)/);
  assert.match(approvalSource, /if \(!tokenRow\.used_at\)/);
});

test("les demandes pending exceptionnelles restent visibles dans Gestion des comptes", () => {
  assert.match(accountSource, /where status <> 'pending'[\s\S]*or email_verified_at is not null/);
});

test("l'approbation manuelle reste disponible pour une régularisation exceptionnelle", () => {
  assert.match(approvalSource, /if \(!target\.email_verified_at\)/);
  assert.match(approvalSource, /if \(!target\.participant_id\)/);
  assert.match(approvalSource, /if \(target\.status !== "pending"\)/);
  assert.match(approvalSource, /set status = 'active'/);
  assert.match(approvalSource, /eventType: "account_approved"/);
  assert.match(integrationSource, /path === "\/admin\/auth\/users\/:id\/approve"[\s\S]*approveVerifiedAccount/);
});
