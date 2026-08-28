import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const service = await readFile(new URL("../admin-users/account-notification-preference-service.js", import.meta.url), "utf8");
const approvalFlow = await readFile(new URL("../admin-users/account-approval-flow-service.js", import.meta.url), "utf8");
const database = await readFile(new URL("../admin-users/database.js", import.meta.url), "utf8");
const routes = await readFile(new URL("../admin-users/explicit-routes.js", import.meta.url), "utf8");

test("la préférence de notification est désactivée par défaut", () => {
  assert.match(database, /receive_account_notifications boolean not null default false/);
});

test("la préférence est administrable depuis la gestion des participants", () => {
  assert.match(routes, /"\/admin\/auth\/notification-preferences"/);
  assert.match(routes, /"\/admin\/participants\/:participantId\/account-notifications"/);
  assert.match(routes, /listManagedAccountNotificationPreferences/);
  assert.match(routes, /updateManagedAccountNotificationPreference/);
  assert.match(service, /listManagedAccountNotificationPreferences/);
  assert.match(service, /updateManagedAccountNotificationPreference/);
});

test("seuls les administrateurs actifs autorisés et abonnés sont destinataires", () => {
  assert.match(service, /u\.status = 'active'/);
  assert.match(service, /u\.role = 'admin' or u\.is_admin = true/);
  assert.match(service, /p\.can_admin = true/);
  assert.match(service, /u\.receive_account_notifications = true/);
  assert.match(service, /lower\(u\.email\) <> lower\(\$1\)/);
});

test("l'activation est refusée sans participant et compte administrateurs actifs", () => {
  assert.match(service, /target\.can_admin !== true/);
  assert.match(service, /target\.is_admin !== true/);
  assert.match(service, /target\.status !== "active"/);
});

test("la confirmation e-mail utilise le service de notification configurable sans auto-activer le compte", () => {
  assert.match(routes, /verifyEmailPendingAdminApproval/);
  assert.match(routes, /app\.get\("\/auth\/verify-email", verifyEmailPendingAdminApproval\)/);
  assert.match(approvalFlow, /notifyAccountRequestReviewers/);
  assert.match(service, /notifyAccountRequestReviewers/);
  assert.doesNotMatch(approvalFlow, /status = case when status = 'pending' then 'active'/);
});
