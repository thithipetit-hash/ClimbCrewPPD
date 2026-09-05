import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const componentUrl = new URL("../src/components/RealisationVideoAnalysis.jsx", import.meta.url);
const profileUrl = new URL("../src/pages/Profil.jsx", import.meta.url);

test("Profil propose le chargement direct d'une vidéo sur une réalisation", async () => {
  const [componentSource, profileSource] = await Promise.all([
    readFile(componentUrl, "utf8"),
    readFile(profileUrl, "utf8"),
  ]);

  assert.match(componentSource, /Charger une vidéo/);
  assert.match(componentSource, /apiUpload\(/);
  assert.match(componentSource, /`\/realisations\/\$\{encodeURIComponent\(realisation\.id\)\}\/videos`/);
  assert.match(componentSource, /MAX_VIDEO_BYTES = 50 \* 1024 \* 1024/);
  assert.match(componentSource, /selectedVideoUrls\.length >= 3/);
  assert.match(componentSource, /Vidéo chargée et associée à cette réalisation/);
  assert.match(componentSource, /await onRefresh\(\)/);
  assert.match(profileSource, /onRefresh=\{refreshRealisations\}/);
});
