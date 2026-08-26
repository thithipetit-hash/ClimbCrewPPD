import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createResetCode,
  RESET_CODE_HEX_LENGTH,
} from "../admin-users/auth-hardening-service.js";

const integrationSource = await readFile(
  new URL("../admin-users/express-integration.js", import.meta.url),
  "utf8",
);
const hardeningSource = await readFile(
  new URL("../admin-users/auth-hardening-service.js", import.meta.url),
  "utf8",
);

test("les routes historiques utilisent les contrôleurs d'authentification durcis", () => {
  assert.match(integrationSource, /path === "\/auth\/login"[\s\S]*secureLogin/);
  assert.match(integrationSource, /path === "\/auth\/forgot-password"[\s\S]*secureForgotPassword/);
  assert.match(integrationSource, /path === "\/auth\/reset-password"[\s\S]*secureResetPassword/);
  assert.match(integrationSource, /path === "\/admin\/auth\/users\/:id\/reset-token"[\s\S]*secureAdminResetToken/);
});

test("un e-mail inconnu et un mauvais mot de passe suivent la même comparaison bcrypt", () => {
  // Un e-mail sans candidat compare tout de même un hash factice, afin que
  // l'absence de compte ne se distingue pas d'un mauvais mot de passe.
  const dummyCompareIndex = hardeningSource.indexOf("await bcrypt.compare(password, await dummyPasswordHashPromise)");
  const invalidIndex = hardeningSource.indexOf("if (!user || !passwordMatches)");
  const statusIndex = hardeningSource.indexOf('if (user.status !== "active")');

  assert.ok(dummyCompareIndex >= 0);
  assert.ok(invalidIndex > dummyCompareIndex);
  assert.ok(statusIndex > invalidIndex);
  assert.match(hardeningSource, /details: \{ reason: "invalid_credentials" \}/);
});

test("les codes de réinitialisation disposent de 64 bits d'entropie", () => {
  const code = createResetCode();
  assert.equal(RESET_CODE_HEX_LENGTH, 16);
  assert.equal(code.length, 16);
  assert.match(code, /^[0-9A-F]{16}$/);
});

test("la réinitialisation ne distingue pas un compte inconnu d'un code invalide", () => {
  assert.match(hardeningSource, /const invalidResetMessage = "Code de réinitialisation invalide ou expiré"/);
  const uses = hardeningSource.match(/error: invalidResetMessage/g) || [];
  assert.ok(uses.length >= 2);
});
