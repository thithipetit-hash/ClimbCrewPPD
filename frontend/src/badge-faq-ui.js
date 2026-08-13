let scheduled = false;

const FAQ_TITLE = "Comment fonctionnent les badges de progression ?";
const BADGE_GROUPS = [
  "Médailles — accomplissements : Première croix ; première réussite en tête ; première réussite en moulinette ; premier À vue ; premier Flash.",
  "Blasons — niveau : Cap 5c, Club 6a, Club 6b, Club 6c et Club 7a, dès qu'une voie de la cotation correspondante ou supérieure est réussie.",
  "Écussons — exploration : Explorateur à 5 cordes différentes ; Tour de salle à 15 cordes ; Polyvalent avec au moins 6 caractéristiques de voies différentes.",
  "Rubans — régularité : Habitué après 5 séances passées ; Fidèle après 25 séances passées.",
  "Rosettes — contribution : Œil d'ouvreur après une cotation proposée sur 10 voies différentes ; Critique de voies après 20 voies différentes notées.",
  "Cristaux — prestige : Collectionneur à 50 voies différentes réussies ; Centurion à 100 réalisations réussies ; Cristal à 100 voies différentes, 25 séances, au moins une réussite en tête et 6 caractéristiques différentes.",
];

function createBadgeFaqItem() {
  const details = document.createElement("details");
  details.className = "faq-item badges-faq-item";
  details.dataset.badgesFaq = "true";

  const summary = document.createElement("summary");
  const title = document.createElement("strong");
  title.textContent = FAQ_TITLE;
  summary.appendChild(title);
  details.appendChild(summary);

  const content = document.createElement("div");
  content.className = "small";

  const intro = document.createElement("p");
  intro.textContent = "Les badges sont calculés automatiquement à partir des données déjà enregistrées : réalisations, voies, caractéristiques, séances, propositions de cotation et notes. Les badges obtenus apparaissent dans la page Progression ; les objectifs restant à atteindre peuvent y être dépliés.";
  content.appendChild(intro);

  const list = document.createElement("ul");
  BADGE_GROUPS.forEach((text) => {
    const item = document.createElement("li");
    item.textContent = text;
    list.appendChild(item);
  });
  content.appendChild(list);

  const note = document.createElement("p");
  note.textContent = "Ces récompenses sont symboliques : elles ne donnent aucune priorité d'inscription ni avantage sportif. Si l'historique est corrigé, elles sont recalculées. Elles constituent aussi la base prévue pour faire évoluer ultérieurement l'avatar du grimpeur.";
  content.appendChild(note);

  details.appendChild(content);
  return details;
}

function updateBadgeFaq() {
  if (document.querySelector('[data-badges-faq="true"]')) return;

  const faqCard = [...document.querySelectorAll(".card")].find((card) => {
    const heading = card.querySelector(":scope > .card-header h2");
    return String(heading?.textContent || "").includes("FAQ");
  });
  if (!faqCard) return;

  faqCard.appendChild(createBadgeFaqItem());
}

function scheduleUpdate() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    updateBadgeFaq();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", scheduleUpdate, { once: true });
} else {
  scheduleUpdate();
}

new MutationObserver(scheduleUpdate).observe(document.documentElement, { childList: true, subtree: true });
