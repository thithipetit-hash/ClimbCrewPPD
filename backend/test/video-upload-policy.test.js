import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  LOCAL_VIDEO_MAX_BYTES,
  VIDEO_UPLOAD_MAX_PARTS,
  assertVideoChunkBody,
  readVideoChunkRequest,
  validateStoredVideoChunks,
} from "../video-upload-policy.js";

function request(overrides = {}) {
  return {
    params: { uploadId: "upload-12345678", partNumber: "0", ...overrides.params },
    headers: {
      "x-total-parts": "1",
      "x-total-bytes": "4",
      "x-video-mime-type": "video/mp4",
      "x-file-name": "clip.mp4",
      ...overrides.headers,
    },
  };
}

test("la politique vidéo accepte un bloc cohérent", () => {
  const metadata = readVideoChunkRequest(request());
  assert.equal(metadata.partNumber, 0);
  assert.equal(metadata.totalParts, 1);
  assert.equal(metadata.mimeType, "video/mp4");
  assertVideoChunkBody(Buffer.from("test"));
});

test("la politique vidéo refuse trop de blocs et les tailles hors limite", () => {
  assert.throws(
    () => readVideoChunkRequest(request({ headers: { "x-total-parts": String(VIDEO_UPLOAD_MAX_PARTS + 1) } })),
    /Nombre de blocs vidéo invalide/,
  );
  assert.throws(
    () => readVideoChunkRequest(request({ headers: { "x-total-bytes": String(LOCAL_VIDEO_MAX_BYTES + 1) } })),
    /Taille totale de vidéo invalide/,
  );
});

test("l'assemblage vérifie toutes les métadonnées et la taille reçue", () => {
  const rows = [
    { part_number: 0, route_id: "r1", realisation_id: "re1", file_name: "x.mp4", mime_type: "video/mp4", total_parts: 2, total_bytes: 4, content_bytes: 2 },
    { part_number: 1, route_id: "r1", realisation_id: "re1", file_name: "x.mp4", mime_type: "video/mp4", total_parts: 2, total_bytes: 4, content_bytes: 2 },
  ];
  const result = validateStoredVideoChunks(rows, { expectedRouteId: "r1", expectedRealisationId: "re1" });
  assert.equal(result.receivedBytes, 4);

  assert.throws(
    () => validateStoredVideoChunks([{ ...rows[0], total_parts: 1, total_bytes: 2, content_bytes: 2, route_id: "other" }], { expectedRouteId: "r1" }),
    /voie attendue/,
  );
});

test("voies et réalisations partagent la même politique d'upload", async () => {
  const [routesSource, realisationsSource] = await Promise.all([
    readFile(new URL("../route-video-routes.js", import.meta.url), "utf8"),
    readFile(new URL("../realisation-management-routes.js", import.meta.url), "utf8"),
  ]);
  for (const source of [routesSource, realisationsSource]) {
    assert.match(source, /from "\.\/video-upload-policy\.js"/);
    assert.match(source, /readVideoChunkRequest\(req\)/);
    assert.match(source, /validateStoredVideoChunks/);
  }
});
