import assert from "node:assert/strict";
import test from "node:test";
import express from "express";

import { setPool } from "./admin-users/database.js";
import { installRealisationManagementRoutes } from "./realisation-management-routes.js";
import { installVideoAnalysisSettingsRoutes } from "./video-analysis-settings-routes.js";

async function withHttpServer(app, run) {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

function auth(req, _res, next) {
  req.auth = {
    user: {
      id: 1,
      role: req.get("x-test-role") === "admin" ? "admin" : "member",
      participantId: "7",
    },
  };
  next();
}

function requireAdmin(req, res, next) {
  if (req.auth?.user?.role !== "admin") return res.status(403).json({ error: "Administrateur requis" });
  next();
}

function jsonRequest(method, body, role = "member") {
  return {
    method,
    headers: {
      "content-type": "application/json",
      "x-test-role": role,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

test("une réalisation refuse une vidéo qui n'appartient pas à sa voie", async () => {
  const calls = [];
  const pool = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, " ").trim().toLowerCase();
      calls.push({ sql: normalized, params });

      if (normalized.includes("select id from routes where id = $1")) {
        return { rows: [{ id: params[0] }], rowCount: 1 };
      }
      if (normalized.includes("from sessions s") && normalized.includes("session_participants")) {
        return { rows: [{ date: "2026-09-01", cotisation: true }], rowCount: 1 };
      }
      if (normalized === "select video_urls from routes where id = $1 limit 1") {
        return {
          rows: [{ video_urls: ["/routes/route-1/videos/allowed"] }],
          rowCount: 1,
        };
      }
      if (normalized.startsWith("insert into realisations")) {
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Requête PostgreSQL inattendue : ${normalized}`);
    },
  };

  const app = express();
  app.use(express.json());
  installRealisationManagementRoutes(app, { requireAuth: auth, pool });

  await withHttpServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/realisations`, jsonRequest("POST", {
      id: "real-video-1",
      sessionId: "session-1",
      voieId: "route-1",
      dateRealisation: "2026-09-01",
      styleRealisation: "a_vue",
      cotationProposee: "6a",
      commentaire: "test vidéo",
      chute: false,
      videoUrls: ["/routes/route-2/videos/foreign"],
    }));

    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /n’appartient pas à cette voie/i);
  });

  assert.equal(calls.some((call) => call.sql.startsWith("insert into realisations")), false);
});

test("une réalisation accepte au maximum trois vidéos appartenant à sa voie", async () => {
  const allowed = [1, 2, 3].map((id) => `/routes/route-1/videos/${id}`);
  let insertedVideoUrls = null;
  const pool = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, " ").trim().toLowerCase();
      if (normalized.includes("select id from routes where id = $1")) {
        return { rows: [{ id: params[0] }], rowCount: 1 };
      }
      if (normalized.includes("from sessions s") && normalized.includes("session_participants")) {
        return { rows: [{ date: "2026-09-01", cotisation: true }], rowCount: 1 };
      }
      if (normalized === "select video_urls from routes where id = $1 limit 1") {
        return { rows: [{ video_urls: allowed }], rowCount: 1 };
      }
      if (normalized.startsWith("insert into realisations")) {
        insertedVideoUrls = JSON.parse(params[12]);
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Requête PostgreSQL inattendue : ${normalized}`);
    },
  };

  const app = express();
  app.use(express.json());
  installRealisationManagementRoutes(app, { requireAuth: auth, pool });

  await withHttpServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/realisations`, jsonRequest("POST", {
      id: "real-video-2",
      sessionId: "session-1",
      voieId: "route-1",
      dateRealisation: "2026-09-01",
      styleRealisation: "a_vue",
      cotationProposee: "6a",
      commentaire: "test vidéos valides",
      chute: false,
      videoUrls: allowed,
    }));

    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).videoUrls, allowed);
  });

  assert.deepEqual(insertedVideoUrls, allowed);
});

test("les règles d'analyse sont lisibles par les membres mais modifiables uniquement par un administrateur", async () => {
  let storedRules = {};
  const pool = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, " ").trim().toLowerCase();
      if (normalized.startsWith("select rules, updated_at from video_analysis_settings")) {
        return storedRules.sampleFps
          ? { rows: [{ rules: storedRules, updated_at: "2026-09-05T20:00:00Z" }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      if (normalized.startsWith("insert into video_analysis_settings")) {
        storedRules = JSON.parse(params[0]);
        return {
          rows: [{ rules: storedRules, updated_at: "2026-09-05T20:00:00Z" }],
          rowCount: 1,
        };
      }
      throw new Error(`Requête PostgreSQL inattendue : ${normalized}`);
    },
  };
  setPool(pool);

  const app = express();
  app.use(express.json());
  installVideoAnalysisSettingsRoutes(app, { requireAuth: auth, requireAdmin });

  await withHttpServer(app, async (baseUrl) => {
    const readResponse = await fetch(`${baseUrl}/video-analysis/rules`, jsonRequest("GET"));
    assert.equal(readResponse.status, 200);
    assert.equal((await readResponse.json()).rules.sampleFps, 4);

    const denied = await fetch(`${baseUrl}/admin/video-analysis/rules`, jsonRequest("PUT", {
      rules: { sampleFps: 5 },
    }));
    assert.equal(denied.status, 403);

    const adminSave = await fetch(`${baseUrl}/admin/video-analysis/rules`, jsonRequest("PUT", {
      rules: { sampleFps: 5 },
    }, "admin"));
    assert.equal(adminSave.status, 200);
    assert.equal((await adminSave.json()).rules.sampleFps, 5);

    const readUpdated = await fetch(`${baseUrl}/video-analysis/rules`, jsonRequest("GET"));
    assert.equal(readUpdated.status, 200);
    assert.equal((await readUpdated.json()).rules.sampleFps, 5);
  });
});

test("un grimpeur peut supprimer définitivement une vidéo qu'il a chargée", async () => {
  const videoUrl = "/routes/route-1/videos/video-1";
  const calls = [];
  const client = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, " ").trim().toLowerCase();
      calls.push({ sql: normalized, params });
      if (["begin", "commit", "rollback"].includes(normalized)) return { rows: [], rowCount: 0 };
      if (normalized.includes("select voie_id, video_urls from realisations")) {
        return { rows: [{ voie_id: "route-1", video_urls: [videoUrl] }], rowCount: 1 };
      }
      if (normalized.startsWith("select id from route_videos")) {
        return { rows: [{ id: "video-1" }], rowCount: 1 };
      }
      if (normalized.includes("from access_logs") && normalized.includes("realisation_video_upload")) {
        return { rows: [{ "?column?": 1 }], rowCount: 1 };
      }
      if (normalized.startsWith("delete from route_videos")) {
        return { rows: [], rowCount: 1 };
      }
      if (normalized.startsWith("update routes") && normalized.includes("array_remove")) {
        return { rows: [{ video_urls: [] }], rowCount: 1 };
      }
      if (normalized.startsWith("update realisations") && normalized.includes("video_urls")) {
        return { rows: [], rowCount: 2 };
      }
      if (normalized.startsWith("insert into access_logs")) {
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Requête PostgreSQL inattendue : ${normalized}`);
    },
    release() {},
  };
  const pool = {
    async query(sql) {
      const normalized = String(sql).replace(/\s+/g, " ").trim().toLowerCase();
      if (normalized.startsWith("alter table routes") || normalized.startsWith("create table if not exists route_videos") || normalized.startsWith("create index if not exists idx_route_videos_route")) {
        return { rows: [], rowCount: 0 };
      }
      throw new Error(`Requête PostgreSQL inattendue hors transaction : ${normalized}`);
    },
    async connect() {
      return client;
    },
  };

  const app = express();
  app.use(express.json());
  installRealisationManagementRoutes(app, { requireAuth: auth, pool });

  await withHttpServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/realisations/real-1/videos/video-1`, jsonRequest("DELETE"));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, videoUrls: [], routeVideoUrls: [] });
  });

  assert.equal(calls.some((call) => call.sql.startsWith("delete from route_videos")), true);
  assert.equal(calls.some((call) => call.sql.startsWith("update realisations") && call.sql.includes("video_urls")), true);
  assert.equal(calls.some((call) => call.sql.includes("'realisation_video_delete'")), true);
});
