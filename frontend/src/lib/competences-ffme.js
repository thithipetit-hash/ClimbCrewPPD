// Ressources issues de l'atlas iconographique FFME fourni avec la demande.
// Les planches FFME sont conservées localement, selon les droits déclarés par le club.
export const COMPETENCE_CATEGORIES = Object.freeze([
  { id: "securite", title: "Sécurité et encordement" },
  { id: "assurage", title: "Assurage" },
  { id: "bloc", title: "Bloc" },
  { id: "materiel", title: "Matériel" },
  { id: "pedagogie", title: "Pédagogie" },
]);

export const FFME_COMPETENCES = Object.freeze([
  {
    id: "check",
    category: "securite",
    title: "Contrôle croisé - la check-list",
    description: "Points de contrôle réciproque et accord de départ ; figures figurant dans les deux pages du document FFME.",
    chapter: "Contrôle croisé et feu vert",
    pages: 2,
    pdfUrl: "https://www.ffme.fr/wp-content/uploads/2020/01/process-general.pdf",
  },
  {
    id: "encord",
    category: "securite",
    title: "Processus d’encordement",
    description: "Concentration, réalisation complète, double contrôle et feu vert : illustration complète d’origine.",
    chapter: "Encordement : nœud de huit",
    pages: 1,
    pdfUrl: "https://www.ffme.fr/wp-content/uploads/2020/01/process-encordement.pdf",
  },
  {
    id: "huit",
    category: "securite",
    title: "Nœud d’encordement en huit",
    description: "Précautions écrites fédérales, à rapprocher de la vidéo officielle du nœud de huit.",
    chapter: "Encordement : nœud de huit",
    pages: 1,
    pdfUrl: "https://www.ffme.fr/wp-content/uploads/2020/01/noeud-huit.pdf",
  },
  {
    id: "cinq",
    category: "assurage",
    title: "Assurage en moulinette en 5 temps",
    description: "Cinq gestes successifs, positions des mains et rappel du maintien de la main sur le brin frein.",
    chapter: "Assurage en moulinette : cinq temps",
    pages: 1,
    pdfUrl: "https://www.ffme.fr/wp-content/uploads/2020/01/assurage-5-temps.pdf",
  },
  {
    id: "trois",
    category: "assurage",
    title: "Assurage à la descente en 3 temps",
    description: "Enchaînement de la descente et contrôle constant du brin frein.",
    chapter: "Descente en moulinette",
    pages: 1,
    pdfUrl: "https://www.ffme.fr/wp-content/uploads/2020/01/assurage-3-temps.pdf",
  },
  {
    id: "leader",
    category: "assurage",
    title: "Assurage du leader",
    description: "Assurage du grimpeur de tête, gestion du mou et vigilance au pied du mur.",
    chapter: "Assurage en tête",
    pages: 1,
    pdfUrl: "https://www.ffme.fr/wp-content/uploads/2020/01/assurage-leader.pdf",
  },
  {
    id: "clip",
    category: "assurage",
    title: "Mousquetonner",
    description: "Plusieurs techniques de clippage et schémas correct / incorrect de la corde dans la dégaine.",
    chapter: "Mousquetonnage et lecture des erreurs",
    pages: 3,
    pdfUrl: "https://www.ffme.fr/wp-content/uploads/2020/01/mousquetonner.pdf",
  },
  {
    id: "parade",
    category: "bloc",
    title: "Parade",
    description: "Positions du pareur, gestes à privilégier et exemples à éviter : illustrations originales FFME.",
    chapter: "Bloc : parade et réception",
    pages: 2,
    pdfUrl: "https://www.ffme.fr/wp-content/uploads/2020/01/parade.pdf",
  },
  {
    id: "comparatif",
    category: "materiel",
    title: "Comparatif FFME des systèmes d’assurage (2026)",
    description: "Affiche complète de comparaison des dispositifs et gestes associés : source 2026, grand format à zoomer.",
    chapter: "Matériel, assurance en moulinette et en tête",
    pages: 1,
    pdfUrl: "https://www.ffme.fr/wp-content/uploads/2026/01/260130_TABLEAU-COMPARATIF.pdf",
  },
  {
    id: "pieds",
    category: "pedagogie",
    title: "Poser les pieds avec précision",
    description: "Jeux et situations éducatives pour le placement du pied et la poussée sur les jambes.",
    chapter: "Appuis de pieds et précision",
    pages: 3,
    pdfUrl: "https://www.ffme.fr/wp-content/uploads/2019/09/pose-poussee.pdf",
  },
  {
    id: "repos",
    category: "pedagogie",
    title: "Chercher les positions de moindre effort",
    description: "Situations éducatives pour identifier des positions stables et économiser les bras.",
    chapter: "Équilibre, repos et économie de l’effort",
    pages: 3,
    pdfUrl: "https://www.ffme.fr/wp-content/uploads/2019/09/position-moindre-effort.pdf",
  },
  {
    id: "lecture",
    category: "pedagogie",
    title: "Lecture et interprétation en escalade",
    description: "Interprétation des prises, anticipation et prise de décision : progression pédagogique fédérale.",
    chapter: "Lecture de voie et anticipation",
    pages: 8,
    pdfUrl: "https://www.ffme.fr/wp-content/uploads/2019/09/developper-interpretation-anticipation.pdf",
  },
]);

export const FFME_VIDEOS = Object.freeze([
  { id: "huit-video", title: "Nœud en huit - vidéo FFME", url: "https://www.youtube.com/watch?v=iBSrRicjK64" },
  { id: "haut-voie", title: "Manœuvre de haut de voie - vidéo FFME", url: "https://www.youtube.com/watch?v=L6-nRIlehD0" },
  { id: "cabestan", title: "Nœud de cabestan - vidéo FFME", url: "https://www.youtube.com/watch?v=0L6tnwtaWUQ" },
  { id: "vitesse", title: "Assurage en vitesse - vidéo FFME", url: "https://www.youtube.com/watch?v=1lIbPzpafYc" },
]);

export const COMPETENCE_IDS = Object.freeze(FFME_COMPETENCES.map((item) => item.id));

function normalizeSearch(value) {
  return String(value || "").replace(/œ/gi, "oe").replace(/æ/gi, "ae").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function filterFfmeCompetences({ category = "all", query = "" } = {}) {
  const normalizedQuery = normalizeSearch(query);
  return FFME_COMPETENCES.filter((item) => {
    if (category !== "all" && item.category !== category) return false;
    if (!normalizedQuery) return true;
    return normalizeSearch([item.title, item.description, item.chapter].join(" ")).includes(normalizedQuery);
  });
}

export function normalizeConsultedCompetences(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id) => typeof id === "string" && COMPETENCE_IDS.includes(id)))];
}

export function getFfmeImagePaths(item) {
  const resource = FFME_COMPETENCES.find((entry) => entry.id === item?.id);
  if (!resource) return [];
  return Array.from(
    { length: resource.pages },
    (_, index) => "/assets/competences-ffme/" + resource.id + "-" + String(index + 1).padStart(2, "0") + ".jpg",
  );
}

// Les PDF sont distribués avec l'application ; aucune lecture depuis l'URL FFME au runtime.
export function getFfmePdfPath(item) {
  const resource = FFME_COMPETENCES.find((entry) => entry.id === item?.id);
  return resource ? "/assets/competences-ffme/" + resource.id + ".pdf" : null;
}
