import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("le chargement local d'une vidéo journalise son nom et son volume", async () => {
  const source = await readFile(new URL("../route-management-routes.js", import.meta.url), "utf8");

  assert.match(source, /'route_video_upload'/);
  assert.match(source, /file_name: fileName/);
  assert.match(source, /size_bytes: sizeBytes/);
  assert.match(source, /size_mb:/);
  assert.match(source, /mime_type: mimeType/);
  assert.match(source, /route_id: req\.params\.id/);
});
