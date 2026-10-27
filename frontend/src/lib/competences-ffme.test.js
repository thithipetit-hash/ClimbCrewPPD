import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
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

test("l’aperçu PDF limite les cadres externes au domaine FFME", () => {
  const nginxConfig = readFileSync(new URL("../../nginx.prod.conf", import.meta.url), "utf8");
  assert.match(nginxConfig, /frame-src https:\/\/www\.ffme\.fr;/);
  assert.doesNotMatch(nginxConfig, /frame-src[^;]*\*/);
});
