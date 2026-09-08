import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/StartupVideoGate.jsx", import.meta.url), "utf8");

test("l'introduction ne peut plus bloquer l'application huit secondes", () => {
  assert.match(source, /SAFETY_TIMEOUT_MS = 2000/);
  assert.doesNotMatch(source, /SAFETY_TIMEOUT_MS = 8000/);
});

test("la vidéo d'introduction ne précharge plus tout le fichier", () => {
  assert.match(source, /preload="metadata"/);
  assert.doesNotMatch(source, /preload="auto"/);
});
