import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sourceUrl = new URL("../realisation-management-routes.js", import.meta.url);
const policyUrl = new URL("../video-upload-policy.js", import.meta.url);

test("le chargement vidéo d'une réalisation reste limité au propriétaire et transactionnel", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /app\.post\(\s*[\r\n\s]*"\/realisations\/:id\/videos"/);
  assert.match(source, /where id = \$1 and participant_id = \$2[\s\S]*for update/i);
  assert.match(source, /Cette réalisation ne vous appartient pas/);
  assert.match(source, /currentRealisationUrls\.length >= 3/);
  assert.doesNotMatch(source, /currentRouteUrls\.length >= 10/);
  assert.doesNotMatch(source, /update routes set video_urls = array_append\(video_urls/);
  assert.match(source, /routeVideoUrls: currentRouteUrls/);
  assert.match(source, /await client\.query\("begin"\)/);
  assert.match(source, /await client\.query\("commit"\)/);
  assert.match(source, /await client\.query\("rollback"\)/);
});

test("le chargement vidéo contrôle format, taille et journalisation", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const policy = await readFile(policyUrl, "utf8");

  assert.match(policy, /LOCAL_VIDEO_MAX_BYTES = 50 \* 1024 \* 1024/);
  assert.match(policy, /video\/mp4/);
  assert.match(policy, /video\/webm/);
  assert.match(policy, /video\/ogg/);
  assert.match(policy, /video\/quicktime/);
  assert.match(source, /'realisation_video_upload'/);
  assert.match(source, /realisation_id: realisationId/);
  assert.match(source, /route_id: realisation\.voie_id/);
  assert.match(source, /size_bytes: content\.length/);
});
