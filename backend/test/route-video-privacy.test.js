import assert from "node:assert/strict";
import test from "node:test";
import { installRouteManagementRoutes } from "../route-management-routes.js";

function createResponseRecorder() {
  const record = {
    statusCode: 200,
    body: null,
    sent: null,
    ended: false,
    headers: {},
  };

  const res = {
    status(code) {
      record.statusCode = code;
      return this;
    },
    json(body) {
      record.body = body;
      return this;
    },
    setHeader(name, value) {
      record.headers[String(name).toLowerCase()] = String(value);
      return this;
    },
    send(content) {
      record.sent = content;
      return this;
    },
    end() {
      record.ended = true;
      return this;
    },
  };

  return { record, res };
}

function createVideoHandler(videoRow) {
  let videoHandler = null;
  const app = {
    get(path, ...handlers) {
      if (path === "/routes/:id/videos/:videoId") {
        videoHandler = handlers.at(-1);
      }
    },
    post() {},
    put() {},
    delete() {},
  };

  const pool = {
    async query(sql, params = []) {
      const source = String(sql || "");
      if (source.includes("from route_videos rv")) {
        return {
          rowCount: 1,
          rows: [{
            ...videoRow,
            content_length: videoRow.content.length,
          }],
        };
      }
      if (source.includes("from route_videos")) {
        let content = videoRow.content;
        if (source.includes("substring(content")) {
          const start = Number(params[2]) - 1;
          const length = Number(params[3]);
          content = content.subarray(start, start + length);
        }
        return { rowCount: 1, rows: [{ content }] };
      }
      return { rowCount: 0, rows: [] };
    },
  };

  installRouteManagementRoutes(app, {
    requireAuth: (_req, _res, next) => next?.(),
    requireAdmin: (_req, _res, next) => next?.(),
    pool,
  });

  assert.equal(typeof videoHandler, "function");
  return videoHandler;
}

async function readVideoAs(videoRow, user) {
  const handler = createVideoHandler(videoRow);
  const { record, res } = createResponseRecorder();
  const req = {
    auth: { user },
    params: { id: "route-1", videoId: "video-1" },
    query: {},
    headers: {},
  };

  await handler(req, res);
  return record;
}

const PRIVATE_PERSONAL_VIDEO = {
  file_name: "perso.mp4",
  mime_type: "video/mp4",
  content: Buffer.from("video-personnelle"),
  source_realisation_id: "real-1",
  source_participant_id: "12",
  source_profile_public: false,
};

test("une vidéo de réalisation privée est invisible pour un autre membre", async () => {
  const result = await readVideoAs(PRIVATE_PERSONAL_VIDEO, {
    role: "user",
    participantId: "99",
  });

  assert.equal(result.statusCode, 404);
  assert.deepEqual(result.body, { error: "Vidéo introuvable" });
  assert.equal(result.sent, null);
});

test("le propriétaire peut lire sa propre vidéo privée sans mise en cache", async () => {
  const result = await readVideoAs(PRIVATE_PERSONAL_VIDEO, {
    role: "user",
    participantId: "12",
  });

  assert.equal(result.statusCode, 200);
  assert.equal(Buffer.compare(result.sent, PRIVATE_PERSONAL_VIDEO.content), 0);
  assert.equal(result.headers["cache-control"], "private, no-store");
});

test("un administrateur peut lire une vidéo privée", async () => {
  const result = await readVideoAs(PRIVATE_PERSONAL_VIDEO, {
    role: "admin",
    participantId: "99",
  });

  assert.equal(result.statusCode, 200);
  assert.equal(Buffer.compare(result.sent, PRIVATE_PERSONAL_VIDEO.content), 0);
});

test("une vidéo de réalisation devient lisible aux membres quand le profil est public", async () => {
  const result = await readVideoAs(
    { ...PRIVATE_PERSONAL_VIDEO, source_profile_public: true },
    { role: "user", participantId: "99" },
  );

  assert.equal(result.statusCode, 200);
  assert.equal(Buffer.compare(result.sent, PRIVATE_PERSONAL_VIDEO.content), 0);
});

test("une vidéo de voie reste lisible à tout membre authentifié", async () => {
  const sharedVideo = {
    file_name: "voie.mp4",
    mime_type: "video/mp4",
    content: Buffer.from("video-voie"),
    source_realisation_id: null,
    source_participant_id: null,
    source_profile_public: false,
  };
  const result = await readVideoAs(sharedVideo, {
    role: "user",
    participantId: "99",
  });

  assert.equal(result.statusCode, 200);
  assert.equal(Buffer.compare(result.sent, sharedVideo.content), 0);
  assert.equal(result.headers["cache-control"], "private, max-age=3600");
});

test("une vidéo personnelle orpheline échoue fermée, même pour un administrateur", async () => {
  const orphanVideo = {
    ...PRIVATE_PERSONAL_VIDEO,
    source_participant_id: null,
  };
  const result = await readVideoAs(orphanVideo, {
    role: "admin",
    participantId: "99",
  });

  assert.equal(result.statusCode, 404);
  assert.equal(result.sent, null);
});
