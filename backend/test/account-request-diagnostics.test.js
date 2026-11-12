import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [requestSource, verificationSource, httpStackSource, bootstrapSource] = await Promise.all([
  readFile(new URL("../admin-users/email-association-service.js", import.meta.url), "utf8"),
  readFile(new URL("../admin-users/account-approval-flow-service.js", import.meta.url), "utf8"),
  readFile(new URL("../middleware/http-stack.js", import.meta.url), "utf8"),
  readFile(new URL("../bootstrap/application-bootstrap.js", import.meta.url), "utf8"),
]);

test("l'instrumentation temporaire d'analyse de création de compte est retirée", () => {
  const sources = [requestSource, verificationSource, httpStackSource, bootstrapSource].join("\n");

  for (const marker of [
    "account_creation_trace",
    "account_creation_result",
    "account_creation_error",
    "account_creation_schema",
    "account_creation_schema_error",
    "account_request_http_summary",
    "cors_origin_rejected",
    "account_email_verification_trace",
    "account_email_verification_error",
    "account_creation_unhandled_error",
    "account_email_verification_unhandled_error",
  ]) {
    assert.doesNotMatch(sources, new RegExp(marker));
  }

  assert.doesNotMatch(requestSource, /writeRuntimeDiagnosticLog/);
  assert.doesNotMatch(verificationSource, /writeRuntimeDiagnosticLog/);
  assert.doesNotMatch(httpStackSource, /writeRuntimeDiagnosticLog/);
  assert.doesNotMatch(bootstrapSource, /writeRuntimeDiagnosticLog/);
});

test("les journaux métier du cycle de compte restent conservés", () => {
  assert.match(requestSource, /eventType:\s*"request_access"/);
  assert.match(requestSource, /account_request_confirmation_email_sent/);
  assert.match(requestSource, /account_request_confirmation_email_failed/);
  assert.match(verificationSource, /account_request_email_verified/);
  assert.match(verificationSource, /account_request_email_verification_failed/);
});

test("le diagnostic de réponse serveur reste disponible sans produire de journal d'analyse", () => {
  assert.match(httpStackSource, /diagnosticStage/);
  assert.match(bootstrapSource, /http_unhandled_error/);
  assert.match(bootstrapSource, /diagnosticStage/);
  assert.doesNotMatch(bootstrapSource, /error\?\.body/);
});
