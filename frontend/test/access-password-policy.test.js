import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const authPageSource = await readFile(new URL("../src/components/AuthPage.jsx", import.meta.url), "utf8");
const passwordPolicySource = await readFile(new URL("../src/lib/password-policy.js", import.meta.url), "utf8");

test("la création de compte affiche nativement la règle à 8 caractères", () => {
  assert.match(passwordPolicySource, /8 caractères minimum/);
  assert.doesNotMatch(passwordPolicySource, /12 caractères/);
  assert.match(authPageSource, /Règles du mot de passe/);
  assert.match(authPageSource, /PASSWORD_RULE_TEXT/);
});

test("création de compte et réinitialisation sont deux formulaires React distincts", () => {
  assert.match(authPageSource, /authView === "request"/);
  assert.match(authPageSource, /handleRequestAccess\(\)/);
  assert.match(authPageSource, /Création d’un compte/);
  assert.match(authPageSource, /authView === "reset"/);
  assert.match(authPageSource, /handleResetPassword\(\)/);
  assert.match(authPageSource, /Mettre à jour le mot de passe/);
  assert.match(authPageSource, /Consulter le texte RGPD/);
});
