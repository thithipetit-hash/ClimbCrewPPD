import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [serviceSource, httpStackSource, bootstrapSource] = await Promise.all([
  readFile(new URL("../admin-users/email-association-service.js", import.meta.url), "utf8"),
  readFile(new URL("../middleware/http-stack.js", import.meta.url), "utf8"),
  readFile(new URL("../bootstrap/application-bootstrap.js", import.meta.url), "utf8"),
]);

test("la création de compte journalise l’étape, le schéma et les diagnostics PostgreSQL sans secret", () => {
  for (const stage of [
    "database_connect",
    "transaction_begin",
    "existing_account_lookup",
    "password_hash",
    "user_insert",
    "verification_token_insert",
    "transaction_commit",
  ]) {
    assert.match(serviceSource, new RegExp(`(?:stage =|setStage\\() ["']?${stage}`.replace(") ", ")")));
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
    "normalize_email_function",
    "verification_tokens_table",
  ]) {
    assert.match(serviceSource, new RegExp(field));
  }

  assert.match(serviceSource, /request_access\.controller_entered/);
  assert.doesNotMatch(serviceSource, /password\s*:\s*password/);
  assert.doesNotMatch(serviceSource, /verificationToken\s*[,}]/);
});

test("le parcours HTTP de création de compte expose une étape sûre et journalise les erreurs globales", () => {
  for (const stage of [
    "http.request_received",
    "http.cookie_sanitizer",
    "http.csrf_bridge",
    "http.prebody_guard",
    "http.cors",
    "http.json_body_parser",
    "http.write_rate_limit",
    "http.route_dispatch",
  ]) {
    assert.match(httpStackSource, new RegExp(stage.replaceAll(".", "\\.")));
  }

  assert.match(httpStackSource, /diagnosticStage/);
  assert.match(httpStackSource, /account_request_http_summary/);
  assert.match(bootstrapSource, /http_unhandled_error/);
  assert.match(bootstrapSource, /diagnosticStage/);
  assert.doesNotMatch(bootstrapSource, /error\?\.body/);
});
