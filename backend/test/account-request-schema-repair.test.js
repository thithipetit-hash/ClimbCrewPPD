import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const requestSource = await readFile(
  new URL("../admin-users/email-association-service.js", import.meta.url),
  "utf8",
);
const repairMigration = await readFile(
  new URL("../database/migrations/029_account_request_schema_repair.sql", import.meta.url),
  "utf8",
);

test("la demande de compte répare la fonction PostgreSQL de normalisation e-mail", () => {
  assert.match(
    requestSource,
    /climbcrew_normalize_email\(email\)[\s\S]*climbcrew_normalize_email\(\$1\)/,
  );
  assert.match(
    repairMigration,
    /create or replace function climbcrew_normalize_email\(input text\)/i,
  );
  assert.match(repairMigration, /split_part\(local_part, '\+', 1\)/i);
  assert.match(repairMigration, /replace\(local_part, '\.', ''\)/i);
});
