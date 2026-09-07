import test from "node:test";
import assert from "node:assert/strict";
import { requestPerformanceRecord } from "../middleware/http-stack.js";

test("les métriques HTTP excluent la query string et arrondissent la durée", () => {
  const record = requestPerformanceRecord(
    { requestId: "req-123", method: "get", url: "/routes?token=secret" },
    { statusCode: 200 },
    123.456,
  );

  assert.deepEqual(record, {
    event: "http_request",
    requestId: "req-123",
    method: "GET",
    path: "/routes",
    status: 200,
    durationMs: 123.5,
    slow: false,
  });
});

test("une requête d'au moins une seconde est marquée lente", () => {
  const record = requestPerformanceRecord(
    { requestId: "req-slow", method: "post", url: "/realisations" },
    { statusCode: 201 },
    1000,
  );

  assert.equal(record.slow, true);
  assert.equal(record.status, 201);
});
