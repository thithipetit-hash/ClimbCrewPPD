import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { sendTokenConfirmationPage } from "../token-confirmation-page.js";

test("la page GET de confirmation n'exécute aucune mutation et propose un POST explicite", () => {
  const headers = new Map();
  let body = "";
  const req = { query: { token: "abc<&" } };
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    set(name, value) { headers.set(name, value); return this; },
    type(value) { headers.set("Content-Type", value); return this; },
    send(value) { body = value; return this; },
  };

  sendTokenConfirmationPage(req, res, {
    title: "Confirmer",
    message: "Valider l'action",
    postPath: "/api/auth/verify-email",
  });

  assert.equal(res.statusCode, 200);
  assert.match(headers.get("Content-Security-Policy"), /form-action 'self'/);
  assert.match(body, /method="post"/);
  assert.match(body, /auth\/verify-email\?token=abc%3C%26/);
});

test("les routes GET affichent la confirmation et les POST consomment les jetons", async () => {
  const source = await readFile(new URL("../admin-users/explicit-routes.js", import.meta.url), "utf8");
  assert.match(source, /app\.get\("\/auth\/verify-email", showVerifyEmailConfirmation\)/);
  assert.match(source, /app\.post\("\/auth\/verify-email", verifyEmailPendingAdminApproval\)/);
  assert.match(source, /app\.get\("\/auth\/change-email\/confirm", showEmailChangeConfirmation\)/);
  assert.match(source, /app\.post\("\/auth\/change-email\/confirm", confirmEmailChange\)/);
});
