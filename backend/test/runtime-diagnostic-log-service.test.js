import test from "node:test";
import assert from "node:assert/strict";
import {
  getRuntimeDiagnosticLogs,
  writeRuntimeDiagnosticLog,
} from "../runtime-diagnostic-log-service.js";

test("les diagnostics runtime restent bornés et masquent les champs sensibles", () => {
  writeRuntimeDiagnosticLog({
    req: {
      ip: "127.0.0.1",
      headers: { "user-agent": "test-agent" },
    },
    eventType: "account_creation_error",
    success: false,
    details: {
      requestId: "request-test",
      stage: "request_access.user_insert",
      password: "SECRET",
      token: "SECRET",
      nested: {
        authorization: "SECRET",
        safe: "visible",
      },
    },
  });

  const [log] = getRuntimeDiagnosticLogs(1);
  assert.equal(log.event_type, "account_creation_error");
  assert.equal(log.success, false);
  assert.equal(log.details.requestId, "request-test");
  assert.equal(log.details.stage, "request_access.user_insert");
  assert.equal(log.details.password, undefined);
  assert.equal(log.details.token, undefined);
  assert.equal(log.details.nested.authorization, undefined);
  assert.equal(log.details.nested.safe, "visible");
  assert.doesNotMatch(log.details_text, /SECRET/);
});
