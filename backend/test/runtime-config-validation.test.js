import test from "node:test";
import assert from "node:assert/strict";
import { createRuntimeConfig } from "../config/runtime-config.js";

function baseEnv(overrides = {}) {
  return {
    DATABASE_URL: "postgres://climbcrew:test@localhost:5432/climbcrew",
    NODE_ENV: "production",
    ...overrides,
  };
}

test("la configuration numérique valide est normalisée", () => {
  const config = createRuntimeConfig(baseEnv({
    PORT: "3200",
    BCRYPT_ROUNDS: "13",
    TRUST_PROXY: "1",
    SESSION_DURATION_DAYS: "14",
    RESET_TOKEN_DURATION_MINUTES: "90",
    WRITE_RATE_LIMIT_PER_MINUTE: "240",
  }));

  assert.equal(config.port, 3200);
  assert.equal(config.bcryptRounds, 13);
  assert.equal(config.trustProxy, 1);
  assert.equal(config.sessionDurationMs, 14 * 24 * 60 * 60 * 1000);
  assert.equal(config.resetTokenDurationMs, 90 * 60 * 1000);
  assert.equal(config.writeRateLimitPerMinute, 240);
});

test("une valeur numérique invalide bloque le démarrage", () => {
  for (const [name, value] of [
    ["PORT", "NaN"],
    ["PORT", "70000"],
    ["BCRYPT_ROUNDS", "2"],
    ["TRUST_PROXY", "-1"],
    ["SESSION_DURATION_DAYS", "0"],
    ["RESET_TOKEN_DURATION_MINUTES", "1"],
    ["WRITE_RATE_LIMIT_PER_MINUTE", "0"],
  ]) {
    assert.throws(
      () => createRuntimeConfig(baseEnv({ [name]: value })),
      new RegExp(name),
    );
  }
});
