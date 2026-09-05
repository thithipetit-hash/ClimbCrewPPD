import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sourceUrl = new URL("../realisation-management-routes.js", import.meta.url);

test("le chargement vidéo d'une réalisation reste limité au propriétaire et transactionnel", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /app\.post\(\s*[\r\n\s]*"\/realisations\/:id\/videos"/);
  assert.match(source, /where id = \$1 and participant_id = \$2[\s\S]*for update/i);
  assert.match(source, /Cette réalisation ne vous appartient pas/);
  assert.match(source, /currentRealisationUrls\.length >= 3/);
  assert.match(source, /currentRouteUrls\.length >= 10/);
  assert.match(source, /await client\.query\("begin"\)/);
  assert.match(source, /await client\.query\("commit"\)/);
  assert.match(source, /await client\.query\("rollback"\)/);
});

test("le chargement vidéo contrôle format, taille et journalisation", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /LOCAL_VIDEO_MAX_BYTES = 50 \* 1024 \* 1024/);
  assert.match(source, /video\/mp4/);
  assert.match(source, /video\/webm/);
  assert.match(source, /video\/ogg/);
  assert.match(source, /video\/quicktime/);
  assert.match(source, /'realisation_video_upload'/);
  assert.match(source, /realisation_id: req\.params\.id/);
  assert.match(source, /route_id: realisation\.voie_id/);
  assert.match(source, /size_bytes: req\.body\.length/);
});
