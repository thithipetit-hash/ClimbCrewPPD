import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [serverSource, logRoutesSource, explicitRoutesSource] = await Promise.all([
  readFile(new URL("../server.js", import.meta.url), "utf8"),
  readFile(new URL("../admin-access-log-routes.js", import.meta.url), "utf8"),
  readFile(new URL("../admin-users/explicit-routes.js", import.meta.url), "utf8"),
]);

test("server.js délègue la consultation des logs administrateur", () => {
  assert.match(serverSource, /installAdminAccessLogRoutes\(app, \{ requireAuth, requireAdmin, pool \}\)/);
  assert.equal(serverSource.includes('app.get("/admin/auth/logs", requireAuth, requireAdmin, async'), false);
  assert.match(explicitRoutesSource, /app\.post\("\/admin\/auth\/users\/:id\/approve", requireAuth, requireAdmin, approveVerifiedAccountWithParticipantRole\)/);
});

test("la route de logs reste protégée et conserve sa requête", () => {
  assert.match(logRoutesSource, /app\.get\("\/admin\/auth\/logs", requireAuth, requireAdmin, async/);
  assert.match(logRoutesSource, /Math\.min\(Number\(req\.query\.limit \|\| 200\), 500\)/);
  assert.match(logRoutesSource, /from access_logs al/);
  assert.match(logRoutesSource, /left join users u on u\.id = al\.user_id/);
  assert.match(logRoutesSource, /order by al\.created_at desc/);
  assert.match(logRoutesSource, /limit \$1/);
});
