import assert from "node:assert/strict";
import test from "node:test";
import { createRuntimeConfig } from "./runtime-config.js";

test("la configuration runtime conserve les valeurs de sécurité par défaut", () => {
  const config = createRuntimeConfig({ DATABASE_URL: "postgres://example.test/db", NODE_ENV: "production" });

  assert.equal(config.isProduction, true);
  assert.equal(config.secureCookies, true);
  assert.equal(config.pgSsl, false);
  assert.equal(config.pgSslRejectUnauthorized, true);
  assert.equal(config.sessionCookieName, "climbcrew_session");
  assert.equal(config.csrfCookieName, "climbcrew_csrf");
});

test("PG_SSL_REJECT_UNAUTHORIZED=false désactive explicitement la vérification TLS", () => {
  const config = createRuntimeConfig({
    DATABASE_URL: "postgres://example.test/db",
    PG_SSL: "true",
    PG_SSL_REJECT_UNAUTHORIZED: "false",
  });

  assert.equal(config.pgSsl, true);
  assert.equal(config.pgSslRejectUnauthorized, false);
});

test("DATABASE_URL reste obligatoire", () => {
  assert.throws(() => createRuntimeConfig({}), /DATABASE_URL is missing/);
});
