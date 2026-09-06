import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const profileSource = await readFile(new URL("../src/pages/Profil.jsx", import.meta.url), "utf8");
const recorderSource = await readFile(new URL("../src/components/ProfileRealisationRecorder.jsx", import.meta.url), "utf8");
const videoSource = await readFile(new URL("../src/components/RealisationVideoAnalysis.jsx", import.meta.url), "utf8");
const apiSource = await readFile(new URL("../src/lib/api.js", import.meta.url), "utf8");
const nginxWorkflowSource = await readFile(new URL("../../.github/workflows/ensure-preprod-nginx-upload.yml", import.meta.url), "utf8");

test("Profil permet d'enregistrer une réalisation avec une vidéo optionnelle", () => {
  assert.match(profileSource, /ProfileRealisationRecorder/);
  assert.match(recorderSource, /apiFetch\("\/realisations"/);
  assert.match(recorderSource, /apiUploadVideoInChunks/);
  assert.match(recorderSource, /\/realisations\/\$\{encodeURIComponent\(createdId\)\}\/video-uploads/);
  assert.match(recorderSource, /50 \* 1024 \* 1024/);
});

test("les vidéos du Profil sont découpées en blocs de 768 Kio avant transfert", () => {
  assert.match(apiSource, /VIDEO_UPLOAD_CHUNK_BYTES = 768 \* 1024/);
  assert.match(apiSource, /file\.slice\(start, end, "application\/octet-stream"\)/);
  assert.match(apiSource, /\/chunks\/\$\{partNumber\}/);
  assert.match(apiSource, /\/complete/);
  assert.match(videoSource, /apiUploadVideoInChunks/);
});

test("les vidéos d'une réalisation peuvent être effacées et comparées deux par deux", () => {
  assert.match(videoSource, /method: "DELETE"/);
  assert.match(videoSource, /\/realisations\/\$\{encodeURIComponent\(realisation\.id\)\}\/videos/);
  assert.match(videoSource, /compareUrls\.length >= 2/);
  assert.match(videoSource, /<strong>Comparaison vidéo<\/strong>/);
  assert.match(videoSource, /<video/);
});

test("le contrôle du proxy vérifie qu'un bloc de 768 Kio franchit la préproduction", () => {
  assert.match(nginxWorkflowSource, /pre-climbcrew\.dip-tcs\.com/);
  assert.match(nginxWorkflowSource, /client_max_body_size\[\[:space:\]\]\+55m/);
  assert.match(nginxWorkflowSource, /bs=1K count=768/);
  assert.match(nginxWorkflowSource, /HTTP_CODE.*413/s);
});
