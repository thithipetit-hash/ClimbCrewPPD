/**
 * Harmonisation de la version affichée, des libellés de consensus et des écrans d'accès.
 *
 * La version suit le format aammjj.iii :
 * - aa : année sur deux chiffres ;
 * - mm : mois ;
 * - jj : jour ;
 * - iii : index du commit sur trois chiffres, incrémenté à chaque commit.
 *
 * La version de ce commit est donc 260807.051.
 */
const APP_VERSION = "260807.051";
const APP_VERSION_LABEL = `Version : ${APP_VERSION}`;
let scheduled = false;

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function updateVisibleVersion() {
  document.querySelectorAll(".small").forEach((element) => {
    const text = String(element.textContent || "").trim();
    if (/^Version\s*:?\s*(?:\d{4}-\d{2}-\d{2}\.\d+|\d{6}\.\d{3})$/.test(text)) {
      element.textContent = APP_VERSION_LABEL;

      // La version doit rester visible sur les écrans de connexion.
      // Une ancienne amélioration masquait ce libellé avec cette classe.
      element.classList.remove("issue13-hidden");
    }
  });
}

function enableEnterSubmission() {
  document.querySelectorAll(".auth-card").forEach((card) => {
    if (card.dataset.climbclubEnterSubmit === "true") return;
    card.dataset.climbclubEnterSubmit = "true";

    // Impact ergonomique : Entrée dans un champ de saisie déclenche le bouton
    // principal de l'écran d'accès actuellement affiché, comme un formulaire HTML.
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.isComposing || event.repeat) return;

      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      if (input.disabled || input.readOnly || input.type === "checkbox") return;

      const submitButton = card.querySelector(".auth-submit-row button:not(:disabled)");
      if (!submitButton) return;

      event.preventDefault();
      submitButton.click();
    });
  });
}

function updateConsensusFallbacks() {
  document.querySelectorAll("label").forEach((label) => {
    if (normalize(label.textContent) !== "cotation consensus") return;

    const container = label.parentElement;
    const input = container?.querySelector("input[readonly]");
    if (!input || normalize(input.value) !== "non calculee") return;

    // Impact visuel : toutes les vues utilisent le même libellé court « nc ».
    input.value = "nc";
    input.setAttribute("value", "nc");
  });
}

function ensureVersionFaq() {
  const faqTitle = [...document.querySelectorAll(".card-header h2")]
    .find((title) => normalize(title.textContent).startsWith("faq"));
  const faqCard = faqTitle?.closest(".card");
  if (!faqCard || faqCard.querySelector('[data-climbclub-version-faq="true"]')) return;

  const details = document.createElement("details");
  details.className = "faq-item";
  details.dataset.climbclubVersionFaq = "true";

  const summary = document.createElement("summary");
  const strong = document.createElement("strong");
  strong.textContent = "Comment est définie la version de l’application ?";
  summary.appendChild(strong);

  const content = document.createElement("div");
  content.className = "small";
  content.textContent = `La version suit le format aammjj.iii. « aa » correspond à l’année, « mm » au mois, « jj » au jour et « iii » à l’index du commit sur trois chiffres. L’index iii doit être incrémenté à chaque commit. Version actuelle : ${APP_VERSION}.`;

  details.append(summary, content);
  faqCard.appendChild(details);
}

function refresh() {
  if (scheduled) return;
  scheduled = true;

  requestAnimationFrame(() => {
    scheduled = false;
    updateVisibleVersion();
    enableEnterSubmission();
    updateConsensusFallbacks();
    ensureVersionFaq();
  });
}

function start() {
  refresh();

  // Les vues sont rendues dynamiquement par React : on réapplique ces règles
  // lorsque le contenu de la page change, sans toucher aux données métier.
  new MutationObserver(refresh)
    .observe(document.body, { childList: true, subtree: true });

  document.addEventListener("change", refresh, true);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
