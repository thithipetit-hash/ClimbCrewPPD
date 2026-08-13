import { calculateSimpleCpr, formatRouteForRealisation } from "./lib/domain.js";
import { calculateClimberProfile, recommendRoutesForNextSession } from "./lib/climber-profile.js";

const STORAGE_KEY = "climbcrew_local_data_v2";
let scheduled = false;

function readState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function createText(tag, text, className = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  return node;
}

function scoreLabel(score) {
  if (!Number.isFinite(score)) return "À découvrir";
  if (score >= 80) return "Très à l'aise";
  if (score >= 65) return "À l'aise";
  if (score >= 50) return "En progression";
  return "À travailler";
}

function createSkillRow(item) {
  const row = document.createElement("div");
  row.className = "climber-profile-skill";

  const heading = document.createElement("div");
  heading.className = "climber-profile-skill-heading";
  heading.appendChild(createText("strong", item.label));
  heading.appendChild(createText(
    "span",
    Number.isFinite(item.score) ? `${item.score} % · ${scoreLabel(item.score)}` : "À découvrir",
    "small",
  ));
  row.appendChild(heading);

  const bar = document.createElement("div");
  bar.className = "climber-profile-bar";
  bar.setAttribute("role", "progressbar");
  bar.setAttribute("aria-label", item.label);
  bar.setAttribute("aria-valuemin", "0");
  bar.setAttribute("aria-valuemax", "100");
  if (Number.isFinite(item.score)) bar.setAttribute("aria-valuenow", String(item.score));

  const fill = document.createElement("span");
  fill.className = "climber-profile-bar-fill";
  fill.style.width = `${Number.isFinite(item.score) ? item.score : 0}%`;
  bar.appendChild(fill);
  row.appendChild(bar);

  const detail = item.attempts > 0
    ? `${item.attempts} réalisation${item.attempts > 1 ? "s" : ""} analysée${item.attempts > 1 ? "s" : ""}`
    : "Aucune réalisation sur une voie portant cette caractéristique.";
  row.appendChild(createText("span", detail, "small"));
  return row;
}

function createSummaryBox(title, items, emptyText) {
  const box = document.createElement("div");
  box.className = "muted-box";
  box.appendChild(createText("strong", title));
  const content = items.length
    ? items.map((item) => `${item.label} ${item.score} %`).join(" · ")
    : emptyText;
  const detail = createText("div", content, "small");
  detail.style.marginTop = "5px";
  box.appendChild(detail);
  return box;
}

function createRecommendationCard(recommendation, index) {
  const card = document.createElement("div");
  card.className = "muted-box climber-recommendation";

  const number = createText("span", String(index + 1), "badge climber-recommendation-number");
  card.appendChild(number);

  const copy = document.createElement("div");
  copy.className = "climber-recommendation-copy";
  copy.appendChild(createText("strong", formatRouteForRealisation(recommendation.route)));
  const reason = createText("div", recommendation.reason, "small");
  reason.style.marginTop = "4px";
  copy.appendChild(reason);
  card.appendChild(copy);
  return card;
}

function buildProgressionCard({ profile, recommendations, cprGrade }) {
  const section = document.createElement("section");
  section.className = "card climber-profile-card";
  section.dataset.climberProfile = "true";

  const header = document.createElement("div");
  header.className = "card-header";
  const titleBlock = document.createElement("div");
  titleBlock.appendChild(createText("h3", "Profil du grimpeur"));
  titleBlock.appendChild(createText(
    "div",
    "Indice d'aisance par caractéristique et sélection de voies pour préparer la prochaine séance.",
    "small",
  ));
  header.appendChild(titleBlock);
  if (profile.referenceGrade) {
    const source = profile.referenceSource === "cpr" ? "CPR" : "niveau";
    header.appendChild(createText("span", `Référence ${source} : ${profile.referenceGrade}`, "badge"));
  }
  section.appendChild(header);

  const layout = document.createElement("div");
  layout.className = "climber-profile-layout";

  const skills = document.createElement("div");
  skills.className = "subcard climber-profile-skills";
  skills.appendChild(createText("strong", "Caractéristiques"));
  skills.appendChild(createText(
    "div",
    "50 % est une zone neutre. Le score se stabilise progressivement avec le nombre de réalisations enregistrées.",
    "small",
  ));
  profile.characteristics.forEach((item) => skills.appendChild(createSkillRow(item)));

  const summaries = document.createElement("div");
  summaries.className = "climber-profile-summary-grid";
  summaries.appendChild(createSummaryBox(
    "Points forts",
    profile.strengths,
    "Pas encore de point fort suffisamment documenté.",
  ));
  summaries.appendChild(createSummaryBox(
    "Axes à travailler",
    profile.developmentAreas,
    "Aucun axe faible marqué pour le moment.",
  ));
  skills.appendChild(summaries);
  layout.appendChild(skills);

  const routes = document.createElement("div");
  routes.className = "subcard climber-recommendations";
  routes.appendChild(createText("strong", "5 voies pour la prochaine séance"));
  routes.appendChild(createText(
    "div",
    "La sélection privilégie les voies non encore réussies, les projets, les axes faibles et une progression autour du niveau de référence.",
    "small",
  ));

  if (recommendations.length) {
    recommendations.forEach((recommendation, index) => routes.appendChild(createRecommendationCard(recommendation, index)));
  } else {
    routes.appendChild(createText("div", "Pas assez de voies cotées pour proposer une sélection.", "muted-box"));
  }

  routes.appendChild(createText(
    "div",
    "Cette proposition est une aide à la préparation : elle reste à adapter à l'échauffement, à la forme du jour et aux consignes d'encadrement.",
    "small",
  ));
  layout.appendChild(routes);
  section.appendChild(layout);

  if (!cprGrade && profile.referenceGrade) {
    section.appendChild(createText(
      "div",
      `Le CPR n'étant pas disponible, la référence ${profile.referenceGrade} est déduite de l'historique du grimpeur.`,
      "small climber-profile-reference-note",
    ));
  }

  return section;
}

function progressionSignature(participantId, realisations, routes, cprGrade) {
  return JSON.stringify({
    participantId,
    cprGrade,
    realisations: realisations.map((item) => [
      item.id,
      item.voieId,
      item.styleRealisation,
      item.modeRealisation,
      item.nbEssais,
    ]),
    routes: routes.map((route) => [
      route.id,
      route.cotationAjustee,
      route.cotationReference,
      route.numeroCorde,
      route.tags,
    ]),
  });
}

function updateProgressionProfile() {
  const filters = document.querySelector(".progression-filters");
  if (!filters) return;
  const rootCard = filters.closest(".card");
  if (!rootCard) return;

  const participantId = String(filters.querySelector("select")?.value || "");
  const existing = rootCard.querySelector('[data-climber-profile="true"]');
  if (!participantId) {
    existing?.remove();
    return;
  }

  const state = readState();
  const routes = Array.isArray(state.routes) ? state.routes : [];
  const realisations = (Array.isArray(state.realisations) ? state.realisations : [])
    .filter((item) => String(item.participantId) === participantId);
  const routesById = Object.fromEntries(routes.map((route) => [route.id, route]));
  const cprGrade = calculateSimpleCpr(realisations, routesById).currentGrade || "";
  const signature = progressionSignature(participantId, realisations, routes, cprGrade);
  if (existing?.dataset.signature === signature) return;

  const profile = calculateClimberProfile({ realisations, routesById, cprGrade });
  const recommendations = recommendRoutesForNextSession({
    routes,
    realisations,
    routesById,
    cprGrade,
    profile,
    limit: 5,
  });
  const next = buildProgressionCard({ profile, recommendations, cprGrade });
  next.dataset.signature = signature;

  if (existing) {
    existing.replaceWith(next);
    return;
  }

  const badges = rootCard.querySelector(".participant-badges-card");
  if (badges) {
    badges.before(next);
    return;
  }

  const stats = rootCard.querySelector(".stats-grid");
  if (stats) stats.after(next);
}

function addFaqItem() {
  if (document.querySelector('[data-climber-profile-faq="true"]')) return;
  const faqCard = [...document.querySelectorAll(".card")].find((card) => (
    String(card.querySelector(":scope > .card-header h2")?.textContent || "").includes("FAQ")
  ));
  if (!faqCard) return;

  const details = document.createElement("details");
  details.className = "faq-item";
  details.dataset.climberProfileFaq = "true";
  const summary = document.createElement("summary");
  summary.appendChild(createText("strong", "Comment sont calculés le profil du grimpeur et les 5 voies proposées ?"));
  details.appendChild(summary);

  const content = document.createElement("div");
  content.className = "small";
  const paragraphs = [
    "Le profil analyse séparément les caractéristiques Dalle, Dévers, Physique, Technique, À doigts, Continuité, Morphologique et Engagée. Chaque réalisation portant une caractéristique contribue à son indice d'aisance.",
    "Le résultat de la réalisation sert de base : À vue 100 %, Flash 95 %, Travaillée 85 %, ancienne réussite sans critère 80 %, Avec repos 60 %, Projet 30 %, Non enchaînée 25 % et Essai/test 20 %. La difficulté ajuste ensuite cette valeur de 5 points par niveau d'écart avec le CPR, avec une limite de 15 points dans chaque sens.",
    "Pour éviter qu'une seule voie donne artificiellement un score extrême, chaque caractéristique commence avec deux performances virtuelles neutres à 50 %. Une caractéristique sans aucune donnée reste indiquée « À découvrir ». Les scores décrivent donc le profil individuel ; ils ne constituent pas un classement entre grimpeurs.",
    "Les cinq voies proposées correspondent à cinq intentions : échauffement autour de CPR -2, consolidation autour de CPR -1, repère au CPR, travail d'un axe faible autour du CPR et défi autour de CPR +1. L'algorithme favorise les voies non encore réussies, les projets à reprendre, les caractéristiques les plus faibles et la variété des cordes. Sans CPR, il utilise le niveau médian de l'historique réussi ; sans historique, il commence par les voies cotées les plus accessibles.",
    "La proposition reste indicative : elle doit être adaptée à l'échauffement réel, à la fatigue, à la forme du jour et aux consignes de l'encadrant.",
  ];
  paragraphs.forEach((text) => content.appendChild(createText("p", text)));
  details.appendChild(content);

  const badgeFaq = faqCard.querySelector('[data-badges-faq="true"]');
  if (badgeFaq) badgeFaq.before(details);
  else faqCard.appendChild(details);
}

function updateUi() {
  updateProgressionProfile();
  addFaqItem();
}

function scheduleUpdate() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    updateUi();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", scheduleUpdate, { once: true });
} else {
  scheduleUpdate();
}

document.addEventListener("change", scheduleUpdate, true);
window.addEventListener("storage", scheduleUpdate);
new MutationObserver(scheduleUpdate).observe(document.documentElement, { childList: true, subtree: true });
