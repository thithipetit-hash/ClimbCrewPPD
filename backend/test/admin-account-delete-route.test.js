import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [source, serverSource, explicitRoutesSource] = await Promise.all([
  readFile(new URL("../admin-account-delete-route.js", import.meta.url), "utf8"),
  readFile(new URL("../server.js", import.meta.url), "utf8"),
  readFile(new URL("../admin-users/explicit-routes.js", import.meta.url), "utf8"),
]);

test("la suppression d'un compte reste strictement administrateur et transactionnelle", () => {
  assert.match(source, /app\.delete\("\/admin\/auth\/users\/:id", requireAuth, requireAdmin, async/);
  assert.match(source, /Number\(req\.auth\.user\.id\) === userId/);
  assert.match(source, /select id, email, role, status from users where id = \$1 for update/);
  assert.match(source, /role = 'admin' and status = 'active'/);
  assert.match(source, /adminsResult\.rows\[0\]\.count <= 1/);
  assert.match(source, /delete from users where id = \$1/);
  assert.match(source, /await client\.query\("commit"\)/);
  assert.match(source, /await client\.query\("rollback"\)/);
  assert.match(source, /eventType: "account_deleted"/);
  assert.match(source, /client\.release\(\)/);
});

test("server.js installe le module et les autres actions de cycle de vie restent explicites", () => {
  assert.match(serverSource, /installAdminAccountDeleteRoute\(app, \{ requireAuth, requireAdmin, pool, logAccess \}\)/);
  assert.equal(serverSource.includes('app.delete("/admin/auth/users/:id", requireAuth, requireAdmin, async'), false);
  assert.match(explicitRoutesSource, /app\.post\("\/admin\/auth\/users\/:id\/revoke", requireAuth, requireAdmin, revokeAccountSafely\)/);
  assert.match(explicitRoutesSource, /app\.post\("\/admin\/auth\/users\/:id\/reactivate", requireAuth, requireAdmin, reactivateAccountSafely\)/);
});
