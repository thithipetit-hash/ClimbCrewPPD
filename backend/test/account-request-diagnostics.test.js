import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../admin-users/email-association-service.js", import.meta.url),
  "utf8",
);

test("la création de compte journalise l’étape et les diagnostics PostgreSQL sans secret", () => {
  for (const stage of [
    "database_connect",
    "transaction_begin",
    "existing_account_lookup",
    "password_hash",
    "user_insert",
    "verification_token_insert",
    "transaction_commit",
  ]) {
    assert.match(source, new RegExp(`stage = ["']${stage}["']`));
  }

  for (const field of [
    "requestId",
    "errorCode",
    "detail",
    "schema",
    "table",
    "column",
    "constraint",
    "routine",
    "transactionCommitted",
  ]) {
    assert.match(source, new RegExp(field));
  }

  assert.doesNotMatch(source, /password\s*:\s*password/);
  assert.doesNotMatch(source, /verificationToken\s*[,}]/);
});
