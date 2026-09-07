import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../realisation-management-routes.js", import.meta.url), "utf8");
const migration = await readFile(new URL("../migrations/007_runtime_schema_consolidation.sql", import.meta.url), "utf8");

test("les vidéos chargées depuis Profil mémorisent leur réalisation source", () => {
  assert.match(migration, /source_realisation_id text/);
  assert.match(source, /insert into route_videos \(id, route_id, file_name, mime_type, content, source_realisation_id\)/);
});

test("le backend reçoit des blocs sous 1 Mio puis les assemble", () => {
  assert.match(source, /VIDEO_UPLOAD_CHUNK_MAX_BYTES = 1024 \* 1024/);
  assert.match(source, /VIDEO_UPLOAD_MAX_PARTS = 80/);
  assert.match(migration, /create table if not exists route_video_upload_chunks/);
  assert.match(source, /\/video-uploads\/:uploadId\/chunks\/:partNumber/);
  assert.match(source, /\/video-uploads\/:uploadId\/complete/);
  assert.match(source, /Buffer\.concat\(buffers, receivedBytes\)/);
  assert.match(source, /receivedBytes !== totalBytes/);
  assert.match(source, /delete from route_video_upload_chunks where participant_id = \$1 and upload_id = \$2/);
});

test("le propriétaire peut retirer une vidéo de sa réalisation", () => {
  assert.match(source, /app\.delete\("\/realisations\/:id\/videos\/:videoId", requireAuth/);
  assert.match(source, /where id = \$1 and participant_id = \$2/);
  assert.match(source, /realisation_video_delete/);
});

test("un fichier vidéo issu de la réalisation est effacé physiquement seulement s'il n'est plus partagé", () => {
  assert.match(source, /source_realisation_id = \$3/);
  assert.match(source, /where id <> \$1 and video_urls \? \$2/);
  assert.match(source, /array_remove\(video_urls, \$2\)/);
  assert.match(source, /deletedPermanently/);
});
