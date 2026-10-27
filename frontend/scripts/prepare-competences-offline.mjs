import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { FFME_COMPETENCES, FFME_VIDEOS, COMPETENCE_CATEGORIES, getFfmeImagePaths } from "../src/lib/competences-ffme.js";
import { COMPETENCE_LESSONS } from "../src/lib/competences-lessons.js";

// Version statique, sans JS ni dépendance réseau : repli de lecture après une coupure.
// Le contenu est généré à partir des données métiers communes à la version React.
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);

const sections = COMPETENCE_CATEGORIES.map(({ id, title }) => {
  const cards = FFME_COMPETENCES.filter((item) => item.category === id).map((item) => {
    const lesson = COMPETENCE_LESSONS[item.id];
    if (!lesson) throw new Error("Fiche manquante : " + item.id);
    const pages = getFfmeImagePaths(item);
    const originalFigures = pages.map((src, index) => '<figure class="ffme-page"><img loading="lazy" src="' + escapeHtml(src)
      + '" alt="Document officiel FFME : ' + escapeHtml(item.title) + ', page ' + (index + 1)
      + ' sur ' + pages.length + '"><figcaption>Page ' + (index + 1) + ' / ' + pages.length + ' · © FFME</figcaption></figure>').join("");
    return '<article class="competence-resource"><h3>' + escapeHtml(item.title) + '</h3>'
      + '<p>' + escapeHtml(item.description) + '</p>'
      + '<details><summary>Consulter la fiche et les ' + pages.length + ' pages officielles FFME</summary>'
      + '<div class="ffme-pages">' + originalFigures + '</div>'
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
.ffme-pages{display:grid;gap:12px;min-width:0}.ffme-page{margin:0}.ffme-page img{display:block;width:100%;height:auto;border:1px solid #b8cddf;border-radius:8px}.ffme-page figcaption{text-align:center;font-size:13px;color:#46627a}
details{border-top:1px solid #d1dce6;margin-top:12px;padding-top:10px}summary{cursor:pointer;font-weight:700;padding:10px 0}
li{margin:6px 0}.alert{background:#fff4df;border-left:4px solid #ca851c;padding:9px 12px}
.notice{padding:12px 15px;background:#fff4df;border-left:4px solid #ca851c}a{color:#136a93}
</style></head><body>
<header><h1>ClimbCrew · Bibliothèque de compétences</h1><p>Version de lecture autonome · sans connexion ni lecteur externe</p></header>
<main><div class="notice"><strong>Lecture hors connexion.</strong> Les 27 pages intégrales des documents officiels FFME sont reproduites telles quelles avec l'autorisation déclarée par le club, à côté des fiches explicatives ClimbCrew.
Les exercices de sécurité exigent un encadrant qualifié. Cette version ne synchronise ni le suivi ni les données du club.</div>
${sections}
<section><h2>Vidéos techniques</h2><p>Les fichiers vidéo ne sont pas distribués sans autorisation. Le lecteur vidéo intégré à l'application fonctionne avec des vidéos autorisées importées sur l'appareil ; il est disponible tant que l'interface interactive reste ouverte.</p><ul>${videoTitles}</ul></section>
</main></body></html>`;
writeFileSync(fileURLToPath(new URL("../public/competences-offline.html", import.meta.url)), html);
console.log("Bibliothèque statique générée : " + FFME_COMPETENCES.length + " fiches, " + FFME_VIDEOS.length + " références vidéo.");
