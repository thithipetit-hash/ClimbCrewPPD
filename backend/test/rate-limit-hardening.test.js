import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [runtimeHelpersSource, httpStackSource] = await Promise.all([
  readFile(new URL("../security/runtime-helpers.js", import.meta.url), "utf8"),
  readFile(new URL("../middleware/http-stack.js", import.meta.url), "utf8"),
]);

test("client IP relies on Express trust proxy resolution", () => {
  const match = runtimeHelpersSource.match(/export function getClientIp\(req\) \{([\s\S]*?)\n\}/);
  assert.ok(match, "getClientIp must exist");
  assert.match(match[1], /req\.ip/);
  assert.doesNotMatch(match[1], /x-forwarded-for/i);
});

test("expired rate-limit buckets are periodically purged", () => {
  assert.match(httpStackSource, /function cleanupExpiredRateLimitBuckets/);
  assert.match(httpStackSource, /buckets\.delete\(key\)/);
  assert.match(httpStackSource, /cleanupExpiredRateLimitBuckets\(now\)/);
});
