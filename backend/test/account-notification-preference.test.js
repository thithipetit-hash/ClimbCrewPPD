import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const service = await readFile(new URL("../admin-users/account-notification-preference-service.js", import.meta.url), "utf8");
const database = await readFile(new URL("../admin-users/database.js", import.meta.url), "utf8");
const integration = await readFile(new URL("../admin-users/express-integration.js", import.meta.url), "utf8");

test("la préférence de notification est persistée par compte administrateur", () => {
  assert.match(database, /receive_account_notifications boolean not null default false/);
  assert.match(integration, /GET|app\.get\("\/auth\/notification-preference"/i);
  assert.match(integration, /app\.patch\("\/auth\/notification-preference"/);
});

test("seuls les administrateurs actifs ayant activé la préférence sont destinataires", () => {
  assert.match(service, /status = 'active'/);
  assert.match(service, /role = 'admin' or is_admin = true/);
  assert.match(service, /receive_account_notifications = true/);
  assert.match(service, /lower\(email\) <> lower\(\$1\)/);
});

test("la confirmation e-mail utilise le service de notification configurable", () => {
  assert.match(integration, /verifyEmailRequestWithNotificationPreferences/);
  assert.match(service, /notifyAccountRequestReviewers/);
});
