import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/StartupVideoGate.jsx", import.meta.url), "utf8");

test("la vidéo d'introduction va à son terme sans timeout automatique", () => {
  assert.doesNotMatch(source, /SAFETY_TIMEOUT_MS/);
  assert.doesNotMatch(source, /setTimeout\(finishIntro,\s*SAFETY_TIMEOUT_MS\)/);
  assert.match(source, /onEnded=\{finishIntro\}/);
});

test("l'utilisateur peut toujours passer volontairement l'introduction", () => {
  assert.match(source, /className="startup-video__skip"/);
  assert.match(source, /onClick=\{finishIntro\}/);
});

test("une erreur vidéo libère rapidement l'application", () => {
  assert.match(source, /VIDEO_ERROR_GRACE_MS = 600/);
  assert.match(source, /onError=\{handleVideoError\}/);
});

test("la vidéo d'introduction ne précharge plus tout le fichier", () => {
  assert.match(source, /preload="metadata"/);
  assert.doesNotMatch(source, /preload="auto"/);
});
