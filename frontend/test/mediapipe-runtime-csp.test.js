import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const analysisSource = readFileSync(new URL("../src/lib/mediapipe-video-analysis.js", import.meta.url), "utf8");
const nginxConfig = readFileSync(new URL("../nginx.prod.conf", import.meta.url), "utf8");

test("MediaPipe utilise uniquement des URL même origine dans le navigateur", () => {
  assert.match(analysisSource, /MEDIAPIPE_MODULE_URL = "\/mediapipe-runtime\/vision_bundle\.mjs"/);
  assert.match(analysisSource, /MEDIAPIPE_WASM_URL = "\/mediapipe-runtime\/wasm"/);
  assert.match(analysisSource, /POSE_MODEL_URL = "\/mediapipe-runtime\/models\/pose_landmarker_lite\.task"/);
  assert.doesNotMatch(analysisSource, /https:\/\/cdn\.jsdelivr\.net/);
  assert.doesNotMatch(analysisSource, /https:\/\/storage\.googleapis\.com/);
});

test("Nginx relaie MediaPipe sans assouplir la CSP", () => {
  assert.match(nginxConfig, /script-src 'self'/);
  assert.match(nginxConfig, /connect-src 'self'/);
  assert.match(nginxConfig, /location \/mediapipe-runtime\//);
  assert.match(nginxConfig, /proxy_pass https:\/\/cdn\.jsdelivr\.net\/npm\/@mediapipe\/tasks-vision@1\.0\.1\//);
  assert.match(nginxConfig, /location = \/mediapipe-runtime\/models\/pose_landmarker_lite\.task/);
  assert.match(nginxConfig, /proxy_pass https:\/\/storage\.googleapis\.com\/mediapipe-models\/pose_landmarker\/pose_landmarker_lite\/float16\/1\/pose_landmarker_lite\.task/);
});
