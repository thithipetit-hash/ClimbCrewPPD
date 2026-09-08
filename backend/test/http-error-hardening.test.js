import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { installHttpStack } from "../middleware/http-stack.js";

function testConfig() {
  return {
    trustProxy: 0,
    secureCookies: false,
    isProduction: false,
    corsOrigins: ["http://localhost"],
    maxJsonBodySize: "1mb",
    writeRateLimitPerMinute: 100,
  };
}

async function withServer(app, operation) {
  const server = await new Promise((resolve) => {
    const active = app.listen(0, "127.0.0.1", () => resolve(active));
  });
  try {
    const address = server.address();
    await operation(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("toute réponse JSON 5xx masque le détail interne et expose un requestId", async () => {
  const app = express();
  installHttpStack(app, testConfig(), {
    isSafeMethod: (method) => ["GET", "HEAD", "OPTIONS"].includes(String(method).toUpperCase()),
    getClientIp: () => "127.0.0.1",
  });
  app.get("/leak", (_req, res) => {
    res.status(500).json({ error: "relation users_secret does not exist", internal: "postgres" });
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/leak`);
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.equal(body.error, "Erreur interne du serveur");
    assert.equal(typeof body.requestId, "string");
    assert.ok(body.requestId.length > 10);
    assert.doesNotMatch(JSON.stringify(body), /users_secret|postgres/i);
    assert.equal(response.headers.get("x-request-id"), body.requestId);
  });
});

test("les erreurs métier 4xx restent explicites", async () => {
  const app = express();
  installHttpStack(app, testConfig(), {
    isSafeMethod: (method) => ["GET", "HEAD", "OPTIONS"].includes(String(method).toUpperCase()),
    getClientIp: () => "127.0.0.1",
  });
  app.get("/bad-request", (_req, res) => {
    res.status(400).json({ error: "Champ invalide" });
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/bad-request`);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "Champ invalide" });
  });
});
