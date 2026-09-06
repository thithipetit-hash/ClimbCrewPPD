import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const profileSource = await readFile(new URL("../src/pages/Profil.jsx", import.meta.url), "utf8");
const recorderSource = await readFile(new URL("../src/components/ProfileRealisationRecorder.jsx", import.meta.url), "utf8");
const videoSource = await readFile(new URL("../src/components/RealisationVideoAnalysis.jsx", import.meta.url), "utf8");
const nginxWorkflowSource = await readFile(new URL("../../.github/workflows/ensure-preprod-nginx-upload.yml", import.meta.url), "utf8");

test("Profil permet d'enregistrer une réalisation avec une vidéo optionnelle", () => {
  assert.match(profileSource, /ProfileRealisationRecorder/);
  assert.match(recorderSource, /apiFetch\("\/realisations"/);
  assert.match(recorderSource, /apiUpload\(\s*`\/realisations\/\$\{encodeURIComponent\(createdId\)\}\/videos`/s);
  assert.match(recorderSource, /50 \* 1024 \* 1024/);
});

test("les vidéos d'une réalisation peuvent être effacées et comparées deux par deux", () => {
  assert.match(videoSource, /method: "DELETE"/);
  assert.match(videoSource, /\/realisations\/\$\{encodeURIComponent\(realisation\.id\)\}\/videos/);
  assert.match(videoSource, /compareUrls\.length >= 2/);
  assert.match(videoSource, /<strong>Comparaison vidéo<\/strong>/);
  assert.match(videoSource, /<video/);
});

test("le workflow corrige le Nginx actif et vérifie un transfert public supérieur à 10 Mo", () => {
  assert.match(nginxWorkflowSource, /pre-climbcrew\.dip-tcs\.com/);
  assert.match(nginxWorkflowSource, /REQUIRED_LIMIT="55m"/);
  assert.match(nginxWorkflowSource, /nginx -t/);
  assert.match(nginxWorkflowSource, /systemctl reload nginx/);
  assert.match(nginxWorkflowSource, /bs=1M count=12/);
  assert.match(nginxWorkflowSource, /HTTP_CODE.*413/s);
});
