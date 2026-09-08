import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [source, serverSource, explicitRoutesSource] = await Promise.all([
  readFile(new URL("../auth-middleware.js", import.meta.url), "utf8"),
  readFile(new URL("../server.js", import.meta.url), "utf8"),
  readFile(new URL("../admin-users/explicit-routes.js", import.meta.url), "utf8"),
]);

test("le middleware conserve la validation de session et le contrôle CSRF", () => {
  assert.match(source, /from user_sessions us/);
  assert.match(source, /join users u on u\.id = us\.user_id/);
  assert.match(source, /us\.revoked_at is null/);
  assert.match(source, /us\.expires_at > now\(\)/);
  assert.match(source, /session\.status !== "active"/);
  assert.match(source, /!isSafeMethod\(req\.method\)/);
  assert.match(source, /req\.headers\["x-csrf-token"\]/);
  assert.match(source, /constantTimeEqual\(csrfHeader, csrfCookie\)/);
  assert.match(source, /sessionId: session\.session_id/);
  assert.match(source, /const user = serializeUser\(session\)/);
});

test("un seul passage d'authentification alimente les deux contrats de contrôleur", () => {
  assert.match(source, /req\.auth = \{/);
  assert.match(source, /req\.enhancementAuth = \{ user \}/);
  assert.equal(explicitRoutesSource.includes("requireAuthUser"), false);
  assert.equal(explicitRoutesSource.includes("requireEnhancementAdmin"), false);
  assert.match(explicitRoutesSource, /app\.post\("\/auth\/change-password", requireAuth, changePassword\)/);
  assert.match(explicitRoutesSource, /app\.post\("\/admin\/auth\/users\/:id\/admin", requireAuth, requireAdmin, updateAdminRightSafely\)/);
});

test("requireAdmin exige toujours le rôle admin", () => {
  assert.match(source, /req\.auth\?\.user\?\.role !== "admin"/);
  assert.match(source, /Accès administrateur requis/);
});

test("server.js installe le middleware extrait sans conserver l'ancienne implémentation", () => {
  assert.match(serverSource, /const \{ requireAuth, requireAdmin \} = createAuthMiddleware\(\{/);
  assert.match(serverSource, /csrfCookieName: config\.csrfCookieName/);
  assert.equal(serverSource.includes("async function loadSessionFromToken(rawToken)"), false);
  assert.equal(serverSource.includes("async function requireAuth(req, res, next)"), false);
  assert.equal(serverSource.includes("function requireAdmin(req, res, next)"), false);
});
