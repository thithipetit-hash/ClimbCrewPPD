import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [serverSource, authSessionSource, explicitRoutesSource] = await Promise.all([
  readFile(new URL("../server.js", import.meta.url), "utf8"),
  readFile(new URL("../auth-session-routes.js", import.meta.url), "utf8"),
  readFile(new URL("../admin-users/explicit-routes.js", import.meta.url), "utf8"),
]);

test("server.js délègue les opérations d'une session déjà authentifiée", () => {
  assert.match(explicitRoutesSource, /app\.post\("\/auth\/login", authRateLimit, secureLogin\)/);
  assert.match(serverSource, /installAuthSessionRoutes\(app, \{/);
  assert.match(serverSource, /sessionDurationMs: SESSION_DURATION_MS/);
  assert.match(explicitRoutesSource, /app\.post\("\/auth\/request-access", authRateLimit, requestAccessByEmailOnly\)/);

  for (const legacyHandler of [
    'app.get("/auth/me", requireAuth, async',
    'app.get("/auth/csrf", requireAuth, async',
    'app.put("/auth/theme", requireAuth, async',
    'app.post("/auth/logout", requireAuth, async',
  ]) {
    assert.equal(serverSource.includes(legacyHandler), false, `handler encore dans server.js: ${legacyHandler}`);
  }
});

test("le module conserve les protections et comportements de session", () => {
  assert.match(authSessionSource, /app\.get\("\/auth\/me", requireAuth, async/);
  assert.match(authSessionSource, /user: req\.auth\.user/);
  assert.match(authSessionSource, /app\.get\("\/auth\/csrf", requireAuth, async/);
  assert.match(authSessionSource, /randomToken\(24\)/);
  assert.match(authSessionSource, /setCsrfCookie\(res, csrfToken, expiresAt\)/);
  assert.match(authSessionSource, /app\.put\("\/auth\/theme", requireAuth, async/);
  assert.match(authSessionSource, /ALLOWED_THEMES\.has\(nextTheme\)/);
  assert.match(authSessionSource, /update users[\s\S]*set theme_preference = \$2[\s\S]*where id = \$1/);
  assert.match(authSessionSource, /serializeUser\(result\.rows\[0\]\)/);
  assert.match(authSessionSource, /app\.post\("\/auth\/logout", requireAuth, async/);
  assert.match(authSessionSource, /update user_sessions set revoked_at = now\(\) where id = \$1/);
  assert.match(authSessionSource, /eventType: "logout"/);
  assert.match(authSessionSource, /clearSessionCookie\(res\)/);
});
