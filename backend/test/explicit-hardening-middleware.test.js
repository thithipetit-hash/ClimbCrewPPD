import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const serverSource = await readFile(new URL("../server.js", import.meta.url), "utf8");
const httpStackSource = await readFile(new URL("../middleware/http-stack.js", import.meta.url), "utf8");
const preloadSource = await readFile(new URL("../deployment-bootstrap.js", import.meta.url), "utf8");
const modulePaths = [
  "../admin-users/cookie-hardening.js",
  "../admin-users/prebody-rate-limit.js",
  "../admin-users/client-ip-hardening.js",
  "../admin-users/rate-limit-log-integration.js",
];
const moduleSources = await Promise.all(
  modulePaths.map((path) => readFile(new URL(path, import.meta.url), "utf8")),
);

test("la pile HTTP enregistre explicitement les middlewares de durcissement", () => {
  assert.match(serverSource, /installHttpStack\(app, config, \{/);
  assert.match(httpStackSource, /app\.use\(sanitizeMalformedCookieHeader\)/);
  assert.match(httpStackSource, /app\.use\(preBodyRequestGuard\)/);
  assert.match(httpStackSource, /app\.use\(trustedClientIpMiddleware\)/);
  assert.match(httpStackSource, /app\.use\(rateLimitLogMiddleware\)/);

  const normalizeIndex = httpStackSource.indexOf("req.url = normalizeApiPath(req.url)");
  const preBodyIndex = httpStackSource.indexOf("app.use(preBodyRequestGuard)");
  const jsonIndex = httpStackSource.indexOf("app.use(express.json");
  assert.ok(normalizeIndex >= 0 && preBodyIndex > normalizeIndex && jsonIndex > preBodyIndex);
});

test("aucun module de durcissement ne surcharge plus express.application.use", () => {
  assert.doesNotMatch(preloadSource, /installCookieHardening|installPreBodyRateLimit|installClientIpHardening|installRateLimitLogIntegration/);
  for (const source of moduleSources) {
    assert.doesNotMatch(source, /express\.application\.use|patchedUse/);
  }
});
