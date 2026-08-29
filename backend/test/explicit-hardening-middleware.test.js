import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const serverSource = await readFile(new URL("../server.js", import.meta.url), "utf8");
const preloadSource = await readFile(new URL("../admin-user-enhancements.js", import.meta.url), "utf8");
const modulePaths = [
  "../admin-users/cookie-hardening.js",
  "../admin-users/prebody-rate-limit.js",
  "../admin-users/client-ip-hardening.js",
  "../admin-users/rate-limit-log-integration.js",
];
const moduleSources = await Promise.all(
  modulePaths.map((path) => readFile(new URL(path, import.meta.url), "utf8")),
);

test("les middlewares de durcissement sont enregistrés explicitement dans server.js", () => {
  assert.match(serverSource, /app\.use\(sanitizeMalformedCookieHeader\)/);
  assert.match(serverSource, /app\.use\(preBodyRequestGuard\)/);
  assert.match(serverSource, /app\.use\(trustedClientIpMiddleware\)/);
  assert.match(serverSource, /app\.use\(rateLimitLogMiddleware\)/);

  const normalizeIndex = serverSource.indexOf("req.url = normalizeApiPath(req.url)");
  const preBodyIndex = serverSource.indexOf("app.use(preBodyRequestGuard)");
  const jsonIndex = serverSource.indexOf("app.use(express.json");
  assert.ok(normalizeIndex >= 0 && preBodyIndex > normalizeIndex && jsonIndex > preBodyIndex);
});

test("aucun module de durcissement ne surcharge plus express.application.use", () => {
  assert.doesNotMatch(preloadSource, /installCookieHardening|installPreBodyRateLimit|installClientIpHardening|installRateLimitLogIntegration/);
  for (const source of moduleSources) {
    assert.doesNotMatch(source, /express\.application\.use|patchedUse/);
  }
});
