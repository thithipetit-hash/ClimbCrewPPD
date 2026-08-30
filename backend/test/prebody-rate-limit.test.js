import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  CANONICAL_RATE_LIMIT_IP,
  describePreBodyRateLimit,
  preBodyRequestGuard,
} from "../admin-users/prebody-rate-limit.js";
import { trustedClientIpMiddleware } from "../admin-users/client-ip-hardening.js";

function fakeResponse() {
  return {
    statusCode: 200,
    payload: null,
    headers: {},
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = String(value);
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

function request(overrides = {}) {
  return {
    method: "POST",
    path: "/participants",
    ip: "203.0.113.10",
    socket: { remoteAddress: "203.0.113.10" },
    headers: {
      "content-type": "application/json",
      "content-length": "100",
    },
    ...overrides,
  };
}

test("le garde-fou est borné et plus strict que le limiteur historique", () => {
  const config = describePreBodyRateLimit();
  assert.equal(config.maxTrackedClients, 4096);
  assert.equal(config.requestsPerMinute, 30);
  assert.equal(config.publicAuthMaxBytes, 64 * 1024);
  assert.equal(config.generalJsonMaxBytes, 2 * 1024 * 1024);
});

test("un corps public d'authentification trop gros est refusé avant parsing", () => {
  const req = request({
    path: "/auth/login",
    ip: "203.0.113.11",
    headers: {
      "content-type": "application/json",
      "content-length": String(64 * 1024 + 1),
    },
  });
  const res = fakeResponse();
  let nextCalled = false;
  preBodyRequestGuard(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 413);
});

test("une rafale est stoppée avant les middlewares historiques", () => {
  let lastResponse = null;
  for (let index = 0; index < 31; index += 1) {
    const req = request({ ip: "203.0.113.12" });
    const res = fakeResponse();
    preBodyRequestGuard(req, res, () => undefined);
    lastResponse = res;
  }
  assert.equal(lastResponse.statusCode, 429);
  assert.equal(lastResponse.headers["retry-after"] !== undefined, true);
});

test("la clé bornée est conservée par le durcissement IP historique", () => {
  const req = request({ ip: "198.51.100.8" });
  req[CANONICAL_RATE_LIMIT_IP] = "0.0.0.0";
  trustedClientIpMiddleware(req, {}, () => undefined);
  assert.equal(req.headers["x-forwarded-for"], "0.0.0.0");
  assert.equal(req.headers["x-real-ip"], "0.0.0.0");
});

test("la pile HTTP normalise l'URL puis applique le garde-fou avant la normalisation IP", async () => {
  const httpStack = await readFile(new URL("../middleware/http-stack.js", import.meta.url), "utf8");
  const normalizeIndex = httpStack.indexOf("req.url = normalizeApiPath(req.url)");
  const guardIndex = httpStack.indexOf("app.use(preBodyRequestGuard);");
  const ipIndex = httpStack.indexOf("app.use(trustedClientIpMiddleware);");
  const jsonIndex = httpStack.indexOf("app.use(express.json");
  assert.ok(normalizeIndex >= 0);
  assert.ok(guardIndex > normalizeIndex);
  assert.ok(ipIndex > guardIndex);
  assert.ok(jsonIndex > ipIndex);
});
