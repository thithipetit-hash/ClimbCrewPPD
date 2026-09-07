import test from "node:test";
import assert from "node:assert/strict";

import {
  isStrongPassword as runtimeIsStrongPassword,
  parseCookies as runtimeParseCookies,
} from "../security/runtime-helpers.js";
import {
  isStrongPassword as adminIsStrongPassword,
  parseCookies as adminParseCookies,
} from "../admin-users/security.js";

test("les modules admin réutilisent les helpers sécurité canoniques", () => {
  assert.equal(adminIsStrongPassword, runtimeIsStrongPassword);
  assert.equal(adminParseCookies, runtimeParseCookies);
});

test("un cookie mal encodé ne provoque pas d'exception serveur", () => {
  const req = { headers: { cookie: "session=%E0%A4%A; csrf=ok%20token" } };
  assert.deepEqual(runtimeParseCookies(req), {
    session: "%E0%A4%A",
    csrf: "ok token",
  });
});

test("la politique mot de passe refuse explicitement plus de 72 octets bcrypt", () => {
  assert.equal(runtimeIsStrongPassword("Abcdef1!"), true);
  assert.equal(runtimeIsStrongPassword(`${"A".repeat(70)}a1!`), false);
  assert.equal(runtimeIsStrongPassword("abcdef1!"), false);
});
