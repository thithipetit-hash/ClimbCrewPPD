import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { installHttpStack, normalizeApiPath, normalizeOrigin, publicRequestOrigin } from "./http-stack.js";

test("normalise les préfixes API historiques sans perdre la query string", () => {
  assert.equal(normalizeApiPath("/api/participants?x=1"), "/participants?x=1");
  assert.equal(normalizeApiPath("/v1/routes"), "/routes");
  assert.equal(normalizeApiPath("/api/v1/sessions"), "/sessions");
  assert.equal(normalizeApiPath("/api"), "/");
});

test("conserve un chemin déjà canonique", () => {
  assert.equal(normalizeApiPath("/health"), "/health");
});


test("reconstruit l'origine publique HTTPS derrière le reverse proxy", () => {
  const req = {
    protocol: "http",
    headers: {
      host: "127.0.0.1:3000",
      "x-forwarded-proto": "https",
      "x-forwarded-host": "pre-climbcrew.dip-tcs.com",
    },
  };
  assert.equal(publicRequestOrigin(req), "https://pre-climbcrew.dip-tcs.com");
  assert.equal(normalizeOrigin("https://pre-climbcrew.dip-tcs.com/"), "https://pre-climbcrew.dip-tcs.com");
});


async function withHttpStackServer(run) {
  const app = express();
  installHttpStack(app, {
    trustProxy: 0,
    secureCookies: false,
    isProduction: false,
    corsOrigins: ["https://allowed.example"],
    maxJsonBodySize: "1mb",
    writeRateLimitPerMinute: 100,
  }, {
    isSafeMethod: (method) => ["GET", "HEAD", "OPTIONS"].includes(String(method).toUpperCase()),
    getClientIp: () => "127.0.0.1",
  });
  app.post("/auth/verify-email", (_req, res) => res.status(204).end());
  app.post("/ordinary-write", (_req, res) => res.status(204).end());
  app.use((error, _req, res, _next) => {
    res.status(error?.status || 500).json({ error: error?.message || "error" });
  });

  const server = await new Promise((resolve) => {
    const active = app.listen(0, "127.0.0.1", () => resolve(active));
  });
  try {
    const address = server.address();
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("le formulaire POST de confirmation par token n'est pas bloqué par CORS", async () => {
  await withHttpStackServer(async (baseUrl) => {
    const confirmation = await fetch(`${baseUrl}/api/auth/verify-email?token=test-token`, {
      method: "POST",
      headers: {
        origin: "null",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "",
    });
    assert.equal(confirmation.status, 204);

    const missingToken = await fetch(`${baseUrl}/api/auth/verify-email`, {
      method: "POST",
      headers: {
        origin: "https://unexpected.example",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "",
    });
    assert.equal(missingToken.status, 403);

    const ordinaryWrite = await fetch(`${baseUrl}/ordinary-write`, {
      method: "POST",
      headers: {
        origin: "https://unexpected.example",
        "content-type": "application/json",
      },
      body: "{}",
    });
    assert.equal(ordinaryWrite.status, 403);
  });
});
