import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../server.js", import.meta.url), "utf8");

test("client IP relies on Express trust proxy resolution", () => {
  const match = source.match(/function getClientIp\(req\) \{([\s\S]*?)\n\}/);
  assert.ok(match, "getClientIp must exist");
  assert.match(match[1], /req\.ip/);
  assert.doesNotMatch(match[1], /x-forwarded-for/i);
});

test("expired rate-limit buckets are periodically purged", () => {
  assert.match(source, /function cleanupExpiredRateLimitBuckets/);
  assert.match(source, /rateLimitBuckets\.delete\(key\)/);
  assert.match(source, /cleanupExpiredRateLimitBuckets\(now\)/);
});
