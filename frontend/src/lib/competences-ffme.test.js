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
  getFfmeImagePaths,
  getFfmePdfPath,
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

test("les liens identifient les sources FFME officielles et les quatre références vidéo", () => {
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
  assert.match(worker, /"\/assets\/competences-ffme\/manifest\.json"/);
  assert.match(worker, /\.\.\.figures/);
  assert.match(worker, /\.\.\.pdfs/);
  assert.match(worker, /cache\.addAll/);
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

test("les 27 pages originales FFME existent, sont de vrais JPEG et correspondent au catalogue", () => {
  const manifest = JSON.parse(readFileSync(new URL("../../public/assets/competences-ffme/manifest.json", import.meta.url), "utf8"));
  const documents = manifest.documents;
  assert.equal(FFME_COMPETENCES.length, Object.keys(documents).length);
  assert.equal(Object.values(documents).flat().length, 27);
  for (const item of FFME_COMPETENCES) {
    assert.deepEqual(getFfmeImagePaths(item), documents[item.id]);
    const pdfPath = getFfmePdfPath(item);
    assert.equal(pdfPath, manifest.pdfs[item.id]);
    assert.match(pdfPath, /^\/assets\/competences-ffme\/[a-z0-9-]+\.pdf$/);
    const pdf = readFileSync(new URL("../../public" + pdfPath, import.meta.url));
    assert.ok(pdf.length > 500, "PDF absent ou incomplet : " + item.id);
    assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-", "PDF mal formé : " + item.id);
    for (const page of documents[item.id]) {
      assert.match(page, /^\/assets\/competences-ffme\/[a-z0-9-]+-\d{2}\.jpg$/);
      const file = readFileSync(new URL("../../public" + page, import.meta.url));
      assert.ok(file.length > 1000, "Page incomplète : " + page);
      assert.equal(file[0], 0xff, "En-tête JPEG non valide : " + page);
      assert.equal(file[1], 0xd8, "En-tête JPEG non valide : " + page);
    }
  }
  assert.deepEqual(getFfmeImagePaths({ id: "../autre" }), []);
  assert.equal(getFfmePdfPath({ id: "../autre" }), null);
  assert.equal(Object.keys(manifest.pdfs).length, 12);
  const generator = readFileSync(new URL("../../scripts/prepare-competences-offline.mjs", import.meta.url), "utf8");
  assert.match(generator, /getFfmePdfPath/);
  assert.match(generator, /EXTRACTED/);
  assert.match(generator, /source-html/);
});

test("les 12 documents ont du texte HTML structuré et 25 schémas séparés des caractères", () => {
  const data = JSON.parse(readFileSync(new URL("../data/ffme-extracted.json", import.meta.url), "utf8"));
  const graphicManifest = JSON.parse(readFileSync(
    new URL("../../public/assets/competences-ffme/illustrations/manifest.json", import.meta.url), "utf8",
  ));
  assert.equal(Object.keys(data).length, 12);
  assert.equal(graphicManifest.figures.length, 25);
  assert.equal(new Set(graphicManifest.figures).size, 25);
  let pageCount = 0;
  let graphicCount = 0;
  let totalCharacters = 0;
  for (const item of FFME_COMPETENCES) {
    const pages = data[item.id]?.pages;
    assert.equal(pages?.length, item.pages, "Pages natives manquantes : " + item.id);
    for (const page of pages) {
      pageCount++;
      assert.ok(page.width > 0 && page.height > 0);
      assert.ok(Array.isArray(page.paragraphs));
      assert.ok(Array.isArray(page.spans));
      for (const block of page.paragraphs) {
        assert.ok(["heading", "paragraph", "list"].includes(block.kind));
        assert.ok(block.lines.every((line) => typeof line === "string" && line.length > 0));
      }
      totalCharacters += page.paragraphs.reduce((sum, block) => sum + block.lines.join("").length, 0);
      if (page.illustration) {
        graphicCount++;
        assert.ok(graphicManifest.figures.includes(page.illustration.src));
        const image = readFileSync(new URL("../../public" + page.illustration.src, import.meta.url));
        assert.ok(image.length > 300);
        assert.equal(image.subarray(0, 4).toString("ascii"), "RIFF");
        assert.equal(image.subarray(8, 12).toString("ascii"), "WEBP");
      }
    }
  }
  assert.equal(pageCount, 27);
  assert.equal(graphicCount, 25);
  assert.ok(totalCharacters > 25000, "L'extraction complète doit préserver le texte FFME.");
  assert.equal(data.check.pages[1].paragraphs.length, 0, "La planche graphique sans texte doit rester une image.");
  const frontend = readFileSync(new URL("../pages/Competences.jsx", import.meta.url), "utf8");
  assert.match(frontend, /CompetencesPdfHtml/);
  assert.doesNotMatch(frontend, /competences-original-figure/);
});
