/**
 * Ajustements transitoires des écrans d'accès et des libellés de consensus.
 *
 * La version est désormais fournie directement par React depuis version.js.
 */
let scheduled = false;

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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

function refresh() {
  if (scheduled) return;
  scheduled = true;

  requestAnimationFrame(() => {
    scheduled = false;
    enableEnterSubmission();
    updateConsensusFallbacks();
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
