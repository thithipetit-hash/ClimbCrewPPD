import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../default-admin-bootstrap.js", import.meta.url), "utf8");

test("le bootstrap ne recrée pas un administrateur actif existant", () => {
  assert.match(source, /role = 'admin' and status = 'active' limit 1/);
  assert.match(source, /if \(activeAdmins\.rowCount > 0\) return/);
});

test("le bootstrap conserve la politique du mot de passe et l'upsert administrateur", () => {
  assert.match(source, /cleanEmail\(firstAdminEmail\)/);
  assert.match(source, /!allowWeakFirstAdminPassword && !isStrongPassword\(firstAdminPassword\)/);
  assert.match(source, /bcrypt\.hash\(firstAdminPassword, bcryptRounds\)/);
  assert.match(source, /insert into users/);
  assert.match(source, /on conflict \(email\) do update set/);
  assert.match(source, /role = 'admin'/);
  assert.match(source, /status = 'active'/);
  assert.match(source, /must_reset_password = false/);
});
