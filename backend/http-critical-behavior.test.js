import assert from "node:assert/strict";
import test from "node:test";
import express from "express";

import { installRealisationManagementRoutes } from "./realisation-management-routes.js";
import { setPool } from "./admin-users/database.js";
import { updateSessionWithAuthorization } from "./admin-users/session-authorization-service.js";

async function withHttpServer(app, run) {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function jsonRequest(method, body, participantId = "7") {
  return {
    method,
    headers: {
      "content-type": "application/json",
      "x-test-participant": participantId,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

function testAuth(req, _res, next) {
  const participantId = req.get("x-test-participant");
  req.auth = {
    user: {
      role: "member",
      participantId: participantId === "none" ? null : participantId,
    },
  };
  next();
}

function sessionPayload(status) {
  return {
    date: "2026-09-01",
    slot: "soir",
    status,
    encadrantId: null,
    referentId: null,
    participantIds: ["7"],
  };
}

function installSessionTestPool({ status, eligible }) {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, " ").trim().toLowerCase();
      calls.push({ sql: normalized, params });
      if (["begin", "commit", "rollback"].includes(normalized)) return { rows: [], rowCount: 0 };
      if (normalized.includes("from sessions where id = $1 for update")) {
        return {
          rows: [{
            id: "session-1",
            date: "2026-09-01",
            slot: "soir",
            status,
            encadrant_id: null,
            referent_id: null,
          }],
          rowCount: 1,
        };
      }
      if (normalized.includes("select participant_id from session_participants") && !normalized.includes("order by")) {
        return { rows: [], rowCount: 0 };
      }
      if (normalized.includes("select can_encadrer, can_referer from participants")) {
        return { rows: [{ can_encadrer: false, can_referer: false }], rowCount: 1 };
      }
      if (normalized.includes("select id from participants where id = $1")) {
        return eligible ? { rows: [{ id: params[0] }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      if (normalized.includes("insert into session_participants")) return { rows: [], rowCount: 1 };
      if (normalized.includes("order by participant_id")) return { rows: [{ participant_id: 7 }], rowCount: 1 };
      throw new Error(`Requête PostgreSQL inattendue dans le test séance : ${normalized}`);
    },
    release() {},
  };
  setPool({
    async query() { return { rows: [], rowCount: 0 }; },
    async connect() { return client; },
  });
  return calls;
}

test("HTTP séance : une séance fermée refuse une nouvelle inscription", async () => {
  const calls = installSessionTestPool({ status: "fermee", eligible: true });
  const app = express();
  app.use(express.json());
  app.put("/sessions/:id", testAuth, updateSessionWithAuthorization);

  await withHttpServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/sessions/session-1`, jsonRequest("PUT", sessionPayload("fermee")));
    const payload = await response.json();
    assert.equal(response.status, 409);
    assert.match(payload.error, /séance est fermée/i);
  });

  assert.equal(calls.some((call) => call.sql === "rollback"), true);
  assert.equal(calls.some((call) => call.sql.includes("insert into session_participants")), false);
});

test("HTTP séance : une séance libre refuse un passeport non éligible", async () => {
  const calls = installSessionTestPool({ status: "libre", eligible: false });
  const app = express();
  app.use(express.json());
  app.put("/sessions/:id", testAuth, updateSessionWithAuthorization);

  await withHttpServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/sessions/session-1`, jsonRequest("PUT", sessionPayload("libre")));
    const payload = await response.json();
    assert.equal(response.status, 400);
    assert.match(payload.error, /passeports jaune, orange, vert ou bleu/i);
  });

  assert.equal(calls.some((call) => call.sql.includes("select id from participants where id = $1")), true);
  assert.equal(calls.some((call) => call.sql.includes("insert into session_participants")), false);
});

test("HTTP réalisations : POST, PUT et DELETE appliquent l'identité authentifiée", async () => {
  const calls = [];
  const pool = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, " ").trim().toLowerCase();
      calls.push({ sql: normalized, params });
      if (normalized.includes("from realisations") && normalized.includes("participant_id = $2")) {
        return { rows: [], rowCount: 0 };
      }
      if (normalized.startsWith("delete from realisations")) {
        const owned = params[0] === "owned" && String(params[1]) === "7";
        return { rows: [], rowCount: owned ? 1 : 0 };
      }
      throw new Error(`Requête PostgreSQL inattendue dans le test réalisation : ${normalized}`);
    },
  };

  const app = express();
  app.use(express.json());
  installRealisationManagementRoutes(app, { requireAuth: testAuth, pool });

  await withHttpServer(app, async (baseUrl) => {
    const postResponse = await fetch(
      `${baseUrl}/realisations`,
      jsonRequest("POST", { participantId: "999" }, "none"),
    );
    assert.equal(postResponse.status, 403);

    const putResponse = await fetch(
      `${baseUrl}/realisations/other`,
      jsonRequest("PUT", { commentaire: "tentative" }),
    );
    assert.equal(putResponse.status, 403);
    assert.match((await putResponse.json()).error, /ne vous appartient pas/i);

    const ownDelete = await fetch(`${baseUrl}/realisations/owned`, jsonRequest("DELETE"));
    assert.equal(ownDelete.status, 200);
    assert.deepEqual(await ownDelete.json(), { ok: true });

    const foreignDelete = await fetch(`${baseUrl}/realisations/other`, jsonRequest("DELETE"));
    assert.equal(foreignDelete.status, 403);
    assert.match((await foreignDelete.json()).error, /ne vous appartient pas/i);
  });

  const deleteCalls = calls.filter((call) => call.sql.startsWith("delete from realisations"));
  assert.deepEqual(deleteCalls.map((call) => call.params), [["owned", "7"], ["other", "7"]]);
});
