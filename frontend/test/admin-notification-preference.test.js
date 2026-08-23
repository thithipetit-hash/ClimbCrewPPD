import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const profileSource = await readFile(new URL("../src/pages/Profil.jsx", import.meta.url), "utf8");

test("le profil administrateur expose la préférence des e-mails de notification", () => {
  assert.match(profileSource, /authUser\?\.role === "admin"/);
  assert.match(profileSource, /\/auth\/notification-preference/);
  assert.match(profileSource, /receiveAccountNotifications/);
  assert.match(profileSource, /Notifications administrateur/);
});
