import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { FFME_COMPETENCES, FFME_VIDEOS, COMPETENCE_CATEGORIES, getFfmePdfPath } from "../src/lib/competences-ffme.js";
import { COMPETENCE_LESSONS } from "../src/lib/competences-lessons.js";

// Version statique, sans JS ni dépendance réseau : repli de lecture après une coupure.
// Le contenu est généré à partir des données métiers communes à la version React.
const EXTRACTED = JSON.parse(readFileSync(new URL("../src/data/ffme-extracted.json", import.meta.url), "utf8"));

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);

const sections = COMPETENCE_CATEGORIES.map(({ id, title }) => {
  const cards = FFME_COMPETENCES.filter((item) => item.category === id).map((item) => {
    const lesson = COMPETENCE_LESSONS[item.id];
    if (!lesson) throw new Error("Fiche manquante : " + item.id);
    const extracted = EXTRACTED[item.id];
    if (!extracted?.pages?.length || extracted.pages.length !== item.pages) throw new Error("Extraction FFME manquante : " + item.id);
    const sourceParagraphs = (page) => page.paragraphs.map((block) =>
      '<' + (block.kind === "heading" ? "h5" : "p") + ' class="source-html">'
      + escapeHtml(block.lines.join("\n")) + '</' + (block.kind === "heading" ? "h5" : "p") + '>'
    ).join("");
    const exactLayout = (page) => '<details><summary>Afficher la mise en page d’origine — page ' + page.number + '</summary>'
      + '<div class="source-layout" style="aspect-ratio:' + page.width + '/' + page.height + '">'
      + (page.illustration ? '<img alt="" class="source-art" src="' + escapeHtml(page.illustration.src)
          + '" style="left:' + 100 * page.illustration.x / page.width + '%;top:' + 100 * page.illustration.y / page.height
          + '%;width:' + 100 * page.illustration.width / page.width + '%;height:' + 100 * page.illustration.height / page.height + '%">' : '')
      + page.spans.map((span) => '<span class="source-span" style="left:' + 100 * span.x / page.width
          + '%;top:' + 100 * span.y / page.height + '%;font-size:' + 100 * span.size / page.width + 'cqw;color:'
          + escapeHtml(span.color) + ';font-weight:' + (span.bold ? 700 : 400)
          + '">' + escapeHtml(span.text) + '</span>').join("")
      + '</div></details>';
    const htmlPages = extracted.pages.map((page) =>
      '<section class="source-page"><h4>Page ' + page.number + ' / ' + extracted.pages.length + '</h4>'
      + sourceParagraphs(page)
      + (page.illustration ? '<figure class="source-figure"><img loading="lazy" src="' + escapeHtml(page.illustration.src)
        + '" alt="Schémas FFME extraits de la page ' + page.number + '"><figcaption>Schémas de la page ' + page.number + ' · © FFME</figcaption></figure>' : '')
      + exactLayout(page) + '</section>'
    ).join("");
    return '<article class="competence-resource"><h3>' + escapeHtml(item.title) + '</h3>'
      + '<p>' + escapeHtml(item.description) + '</p>'
      + '<details><summary>Consulter le texte HTML et les schémas FFME (' + extracted.pages.length + ' pages)</summary>'
      + '<p><a class="official-pdf" href="' + escapeHtml(getFfmePdfPath(item)) + '" download="FFME-' + escapeHtml(item.id) + '.pdf">Télécharger le PDF original FFME (local)</a></p>'
      + '<div class="ffme-native-content">' + htmlPages + '</div>'
      + '<p><strong>Objectif :</strong> ' + escapeHtml(lesson.objective) + '</p>'
      + '<ul>' + lesson.points.map((point) => '<li>' + escapeHtml(point) + '</li>').join("") + '</ul>'
      + '<p class="alert"><strong>Vigilance :</strong> ' + escapeHtml(lesson.vigilance) + '</p></details></article>';
  }).join("");
  return '<section><h2>' + escapeHtml(title) + '</h2><div class="grid">' + cards + '</div></section>';
}).join("");

const videoTitles = FFME_VIDEOS.map((video) => '<li>' + escapeHtml(video.title) + ' (fichier local non embarqué)</li>').join("");
const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#12334b"><title>ClimbCrew · Compétences autonomes</title>
<style>
*{box-sizing:border-box}body{font:16px/1.55 system-ui,Arial,sans-serif;background:#f1f6fa;color:#16334a;margin:0}
header{padding:24px clamp(14px,5vw,48px);background:#143c58;color:white}header h1{font-size:clamp(24px,4vw,36px);margin:0}
main{max-width:1150px;padding:12px 14px 44px;margin:auto}h2{margin:24px 0 14px}h3{font-size:18px;margin:0 0 10px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,330px),1fr));gap:14px}
.competence-resource{min-width:0;border:1px solid #c9d9e5;border-radius:12px;padding:16px;background:white}
.ffme-native-content{display:grid;gap:14px;min-width:0}.source-page{padding:12px;border:1px solid #c9d9e5;border-radius:9px;min-width:0}.source-page .source-html{white-space:pre-line;overflow-wrap:anywhere}.source-figure{margin:10px 0}.source-figure img{width:100%;height:auto;max-height:650px;object-fit:contain}.source-figure figcaption{font-size:13px;text-align:center}.source-layout{position:relative;width:100%;container-type:inline-size;background:#fff;overflow:hidden;border:1px solid #ddd}.source-art,.source-span{position:absolute}.source-art{object-fit:fill}.source-span{display:block;white-space:pre;line-height:1;font-family:Arial,sans-serif}
details{border-top:1px solid #d1dce6;margin-top:12px;padding-top:10px}summary{cursor:pointer;font-weight:700;padding:10px 0}
li{margin:6px 0}.alert{background:#fff4df;border-left:4px solid #ca851c;padding:9px 12px}
.notice{padding:12px 15px;background:#fff4df;border-left:4px solid #ca851c}a{color:#136a93}.official-pdf{display:inline-block;border:1px solid #b1cadd;border-radius:7px;padding:8px 12px;font-weight:700}
</style></head><body>
<header><h1>ClimbCrew · Bibliothèque de compétences</h1><p>Version de lecture autonome · sans connexion ni lecteur externe</p></header>
<main><div class="notice"><strong>Lecture hors connexion.</strong> Le texte officiel FFME est disponible en HTML sélectionnable et les schémas en images séparées. Une présentation fidèle du document original est également accessible ; les PDF sont conservés au téléchargement.
Les exercices de sécurité exigent un encadrant qualifié. Cette version ne synchronise ni le suivi ni les données du club.</div>
${sections}
<section><h2>Vidéos techniques</h2><p>Les fichiers vidéo ne sont pas distribués sans autorisation. Le lecteur vidéo intégré à l'application fonctionne avec des vidéos autorisées importées sur l'appareil ; il est disponible tant que l'interface interactive reste ouverte.</p><ul>${videoTitles}</ul></section>
</main></body></html>`;
writeFileSync(fileURLToPath(new URL("../public/competences-offline.html", import.meta.url)), html);
console.log("Bibliothèque statique générée : " + FFME_COMPETENCES.length + " fiches, " + FFME_VIDEOS.length + " références vidéo.");
