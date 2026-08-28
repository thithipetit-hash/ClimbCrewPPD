import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createResetCode,
  RESET_CODE_HEX_LENGTH,
} from "../admin-users/auth-hardening-service.js";

const routesSource = await readFile(
  new URL("../admin-users/explicit-routes.js", import.meta.url),
  "utf8",
);
const hardeningSource = await readFile(
  new URL("../admin-users/auth-hardening-service.js", import.meta.url),
  "utf8",
);

test("les routes d'authentification utilisent explicitement les contrôleurs durcis", () => {
  assert.match(routesSource, /app\.post\("\/auth\/login", authRateLimit, secureLogin\)/);
  assert.match(routesSource, /app\.post\("\/auth\/forgot-password", resetRateLimit, secureForgotPassword\)/);
  assert.match(routesSource, /app\.post\("\/auth\/reset-password", resetRateLimit, secureResetPassword\)/);
  assert.match(routesSource, /app\.post\("\/admin\/auth\/users\/:id\/reset-token", requireAuth, requireAdmin, secureAdminResetToken\)/);
});

test("un e-mail inconnu et un mauvais mot de passe suivent la même comparaison bcrypt", () => {
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
