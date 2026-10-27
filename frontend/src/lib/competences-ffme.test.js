import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { COMPETENCE_LESSONS } from "./competences-lessons.js";
import { validateMediaFile, mediaStorageKey, MEDIA_LIMIT_BYTES } from "./competences-local-media.js";
import {
  COMPETENCE_CATEGORIES,
  FFME_COMPETENCES,
  FFME_VIDEOS,
  filterFfmeCompetences,
  normalizeConsultedCompetences,
} from "./competences-ffme.js";

test("les 12 fiches de l’atlas couvrent ses cinq domaines", () => {
  assert.equal(FFME_COMPETENCES.length, 12);
  assert.equal(COMPETENCE_CATEGORIES.length, 5);
  assert.equal(new Set(FFME_COMPETENCES.map((item) => item.id)).size, FFME_COMPETENCES.length);
  assert.deepEqual(
    COMPETENCE_CATEGORIES.map((group) => FFME_COMPETENCES.filter((item) => item.category === group.id).length),
    [3, 4, 1, 1, 3],
  );
});

test("les documents restent sur le site FFME et les quatre vidéos sur YouTube", () => {
  for (const item of FFME_COMPETENCES) {
    assert.match(item.pdfUrl, /^https:\/\/www\.ffme\.fr\/wp-content\/uploads\/.+\.pdf$/i);
    assert.ok(item.chapter);
    assert.ok(item.pages >= 1);
  }
  assert.equal(FFME_VIDEOS.length, 4);
  for (const video of FFME_VIDEOS) {
    assert.match(video.url, /^https:\/\/www\.youtube\.com\/watch\?v=/);
  }
});

test("le filtrage fonctionne par domaine et sans accents", () => {
  assert.deepEqual(filterFfmeCompetences({ category: "bloc" }).map((item) => item.id), ["parade"]);
  assert.deepEqual(filterFfmeCompetences({ query: "noeud" }).map((item) => item.id), ["encord", "huit"]);
  assert.deepEqual(filterFfmeCompetences({ query: "PÉDAGOGIE INTROUVABLE" }), []);
  assert.equal(filterFfmeCompetences({}).length, 12);
});

test("le suivi de consultation rejette les entrées inconnues et les doublons", () => {
  assert.deepEqual(normalizeConsultedCompetences(["parade", "huit", "parade", "inconnu", 12]), ["parade", "huit"]);
  assert.deepEqual(normalizeConsultedCompetences({}), []);
});

test("les 12 fiches comportent un apprentissage original et des précautions", () => {
  assert.deepEqual(Object.keys(COMPETENCE_LESSONS).sort(), FFME_COMPETENCES.map((item) => item.id).sort());
  for (const { id } of FFME_COMPETENCES) {
    const lesson = COMPETENCE_LESSONS[id];
    assert.ok(lesson.objective.length >= 20);
    assert.ok(lesson.points.length >= 3);
    assert.ok(lesson.vigilance.length >= 20);
  }
});

test("l'import local accepte seulement les images et vidéos prévues, et limite leur taille", () => {
  assert.equal(mediaStorageKey("video", "huit-video"), "video:huit-video");
  assert.throws(() => mediaStorageKey("video", "../outside"));
  assert.throws(() => mediaStorageKey("script", "huit-video"));
  assert.equal(validateMediaFile({ type: "video/mp4", size: 1024 }, "video"), true);
  assert.equal(validateMediaFile({ type: "image/webp", size: 500 }, "image"), true);
  assert.throws(() => validateMediaFile({ type: "text/html", size: 10 }, "image"));
  assert.throws(() => validateMediaFile({ type: "video/mp4", size: MEDIA_LIMIT_BYTES.video + 1 }, "video"));
});

test("le lecteur utilise les blobs locaux ; les cadres FFME/YouTube ont été supprimés", () => {
  const nginx = readFileSync(new URL("../../nginx.prod.conf", import.meta.url), "utf8");
  const page = readFileSync(new URL("../pages/Competences.jsx", import.meta.url), "utf8");
  assert.match(nginx, /media-src 'self' blob:/);
  assert.match(nginx, /img-src 'self' data: blob:/);
  assert.doesNotMatch(nginx, /frame-src https:\/\/www\.ffme\.fr/);
  assert.doesNotMatch(page, /<iframe|<object|pdfUrl|video\.url/);
});

test("le cache autonome ne stocke jamais l'API ni les données privées", () => {
  const worker = readFileSync(new URL("../../public/competences-sw.js", import.meta.url), "utf8");
  const entry = readFileSync(new URL("../main.jsx", import.meta.url), "utf8");
  assert.match(worker, /path\.startsWith\("\/api\/"\)/);
  assert.match(worker, /path === "\/deployment-version\.json"/);
  assert.match(worker, /request\.method !== "GET"/);
  assert.match(worker, /cache\.addAll\(\[\.\.\.urls, "\/competences-offline\.html"\]\)/);
  assert.match(entry, /<Competences accountId="autonome" standalone/);
  assert.match(entry, /navigator\.serviceWorker\.register/);
});

test("la version de secours est générée depuis la même source et sans JavaScript externe", () => {
  const generator = readFileSync(new URL("../../scripts/prepare-competences-offline.mjs", import.meta.url), "utf8");
  assert.match(generator, /COMPETENCE_LESSONS/);
  assert.match(generator, /FFME_COMPETENCES/);
  assert.match(generator, /<details>/);
  assert.doesNotMatch(generator, /<script/);
});
