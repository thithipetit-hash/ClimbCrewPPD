import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const routeSource = await readFile(new URL("../route-management-routes.js", import.meta.url), "utf8");
const realisationSource = await readFile(new URL("../realisation-management-routes.js", import.meta.url), "utf8");
const migration = await readFile(new URL("../database/migrations/008_video_upload_cleanup.sql", import.meta.url), "utf8");

test("une lecture HTTP Range extrait uniquement la plage demandée en PostgreSQL", () => {
  assert.match(routeSource, /octet_length\(rv\.content\)::bigint as content_length/);
  assert.match(routeSource, /substring\(content from \$3 for \$4\) as content/);
  assert.doesNotMatch(routeSource, /rv\.content,\s*rv\.source_realisation_id/);
});

test("le nettoyage des chunks est limité à une exécution périodique", () => {
  assert.match(realisationSource, /VIDEO_CHUNK_CLEANUP_INTERVAL_MS = 60 \* 60 \* 1000/);
  assert.match(realisationSource, /cleanupExpiredVideoChunks\(pool\)/);
  assert.match(realisationSource, /nextVideoChunkCleanupAt = now \+ VIDEO_CHUNK_CLEANUP_INTERVAL_MS/);
});

test("la finalisation vidéo laisse PostgreSQL agréger les fragments", () => {
  assert.match(realisationSource, /octet_length\(content\)::integer as content_bytes/);
  assert.match(realisationSource, /string_agg\(content, ''::bytea order by part_number\) as content/);
  assert.doesNotMatch(realisationSource, /Buffer\.concat\(buffers/);
});

test("la migration indexe la date utilisée pour expirer les chunks", () => {
  assert.match(migration, /idx_route_video_upload_chunks_created_at/);
  assert.match(migration, /route_video_upload_chunks\(created_at\)/);
});
