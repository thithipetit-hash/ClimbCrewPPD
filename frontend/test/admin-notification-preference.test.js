import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const profileSource = await readFile(new URL("../src/pages/Profil.jsx", import.meta.url), "utf8");
const administrationSource = await readFile(new URL("../src/pages/Administration.jsx", import.meta.url), "utf8");

test("la préférence e-mail administrateur est gérée dans Administration React et plus dans Mon profil", () => {
  assert.doesNotMatch(profileSource, /Notifications administrateur/);
  assert.doesNotMatch(profileSource, /\/auth\/notification-preference/);
  assert.match(administrationSource, /E-mail demandes/);
  assert.match(administrationSource, /\/admin\/auth\/notification-preferences/);
  assert.match(administrationSource, /account-notifications/);
  assert.match(administrationSource, /receiveAccountNotifications/);
});
