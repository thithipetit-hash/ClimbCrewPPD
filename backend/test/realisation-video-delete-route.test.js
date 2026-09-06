import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../realisation-management-routes.js", import.meta.url), "utf8");

test("les vidéos chargées depuis Profil mémorisent leur réalisation source", () => {
  assert.match(source, /source_realisation_id text/);
  assert.match(source, /insert into route_videos \(id, route_id, file_name, mime_type, content, source_realisation_id\)/);
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
