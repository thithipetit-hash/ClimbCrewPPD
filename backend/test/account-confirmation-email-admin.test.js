import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const accountSource = await readFile(new URL("../admin-users/account-service.js", import.meta.url), "utf8");
const routesSource = await readFile(new URL("../admin-users/explicit-routes.js", import.meta.url), "utf8");

test("l'administration expose le dernier statut d'envoi de confirmation", () => {
  assert.match(accountSource, /confirmation_email_event/);
  assert.match(accountSource, /account_request_confirmation_email_sent/);
  assert.match(accountSource, /account_request_confirmation_email_skipped/);
  assert.match(accountSource, /account_request_confirmation_email_failed/);
});

test("un administrateur peut régénérer et renvoyer un lien de confirmation", () => {
  assert.match(accountSource, /export async function resendAccountConfirmationEmail/);
  assert.match(accountSource, /insert into email_verification_tokens/);
  assert.match(accountSource, /sendAccountRequestConfirmation/);
  assert.match(routesSource, /\/admin\/auth\/users\/:id\/resend-confirmation/);
});
