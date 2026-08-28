import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("la politique de mot de passe utilise un minimum de 8 caractères partout", async () => {
  const [frontend, frontendPolicy, server, security, requestAccess] = await Promise.all([
    readFile(new URL("../../frontend/src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../../frontend/src/lib/password-policy.js", import.meta.url), "utf8"),
    readFile(new URL("../server.js", import.meta.url), "utf8"),
    readFile(new URL("../admin-users/security.js", import.meta.url), "utf8"),
    readFile(new URL("../admin-users/email-association-service.js", import.meta.url), "utf8"),
  ]);

  assert.match(frontend, /from "\.\/lib\/password-policy\.js"/);
  assert.match(frontend, /PASSWORD_RULE_TEXT/);
  assert.match(frontend, /isStrongPassword/);
  assert.match(frontendPolicy, /8 caractères minimum/);
  assert.match(frontendPolicy, /value\.length >= 8/);

  assert.match(server, /value\.length >= 8/);
  assert.match(security, /Buffer\.byteLength\(value, "utf8"\) <= 72/);
  assert.match(security, /value\.length >= 8/);
  assert.match(requestAccess, /entre 8 caractères et 72 octets/);
  assert.match(requestAccess, /isStrongPassword\(password\)/);

  assert.doesNotMatch(frontendPolicy, /value\.length >= 12/);
  assert.doesNotMatch(server, /value\.length >= 12/);
  assert.doesNotMatch(security, /value\.length >= 12/);
});
