/**
 * Ajustements d'interface ClimbCrew.
 *
 * Ce module complète le composant React sans modifier les données métier :
 * - applique les dix ambiances visuelles proposées ;
 * - conserve les couleurs fonctionnelles des passeports et des voies ;
 * - garantit que les séances de la vue semaine restent dans leur jour ;
 * - expose le choix d'ambiance uniquement dans le menu latéral.
 */
const STYLE_ID = "climbcrew-ui-enhancements";
const THEME_SELECTOR_ID = "climbcrew-look-selector";
const SLOT_ORDER = ["midi", "soir", "matin"];
const SUPPORTED_THEMES = new Set(["auto", "craie_ardoise", "ocean_mineral", "foret_mousse", "terre_cuite", "aurore_alpine", "lavande_nocturne", "sable_corde", "bloc_neon", "glacier", "cristal"]);
const THEME_LABELS = {
  "auto": "Automatique",
  "craie_ardoise": "Craie & Ardoise",
  "ocean_mineral": "Océan minéral",
  "foret_mousse": "Forêt mousse",
  "terre_cuite": "Terre cuite",
  "aurore_alpine": "Aurore alpine",
  "lavande_nocturne": "Lavande nocturne",
  "sable_corde": "Sable & Corde",
  "bloc_neon": "Bloc néon",
  "glacier": "Glacier",
  "cristal": "Cristal"
};

let scheduled = false;
let pendingThemeNormalization = "";

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function setTextIfChanged(element, value) {
  if (element && element.textContent !== value) element.textContent = value;
}



function sessionSlot(card) {
  const title = card.querySelector(":scope > .card-header h3, :scope > .card-header strong");
  const text = normalize(title?.textContent);
  return SLOT_ORDER.find((slot) => text === slot || text.endsWith(slot)) || "";
}

function reorderChildren(parent, cards) {
  const sorted = [...cards].sort((left, right) => {
    const leftIndex = SLOT_ORDER.indexOf(sessionSlot(left));
    const rightIndex = SLOT_ORDER.indexOf(sessionSlot(right));
    return (leftIndex < 0 ? 99 : leftIndex) - (rightIndex < 0 ? 99 : rightIndex);
  });

  if (cards.every((card, index) => card === sorted[index])) return;
  sorted.forEach((card) => parent.appendChild(card));
}

/**
 * Trie les séances uniquement à l'intérieur de leur propre journée.
 * Aucun déplacement n'est effectué entre deux cartes de jour.
 */
function normalizeWeekView() {
  document.querySelectorAll(".week-day-card").forEach((dayCard) => {
    const sessionsContainer = dayCard.querySelector(":scope > .week-day-sessions");
    if (!sessionsContainer) return;

    const cards = [...sessionsContainer.children]
      .filter((child) => child.classList?.contains("session-card"));

    if (cards.length > 1) reorderChildren(sessionsContainer, cards);
  });

  /* Compatibilité avec l'ancienne structure de la vue semaine. */
  document.querySelectorAll(".grid.five > .card").forEach((dayCard) => {
    const stack = [...dayCard.children]
      .find((child) => child.classList?.contains("stack"));
    if (!stack) return;

    const cards = [...stack.children]
      .filter((child) => child.classList?.contains("subcard"));

    if (cards.length > 1) reorderChildren(stack, cards);
  });
}

function preserveFunctionalRouteColors() {
  document.querySelectorAll(".route-card").forEach((card) => {
    const backgroundColor = card.style.backgroundColor;
    const color = card.style.color;
    if (backgroundColor) card.style.setProperty("background-color", backgroundColor, "important");
    if (color) card.style.setProperty("color", color, "important");
  });
}

function preferredSystemTheme() {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "lavande_nocturne" : "craie_ardoise";
}

/**
 * Le select React d'origine reste la source de vérité pour la sauvegarde API.
 * Il est masqué et piloté par un select dédié contenant les dix ambiances
 * et le mode automatique, tout en conservant la sauvegarde React.
 */
function configureThemeSelector() {
  const root = document.documentElement;
  const originalSelector = document.getElementById("sidebar-theme-selector");
  const rootTheme = SUPPORTED_THEMES.has(root.dataset.theme) ? root.dataset.theme : preferredSystemTheme();
  const selectedTheme = SUPPORTED_THEMES.has(originalSelector?.value) ? originalSelector.value : rootTheme;

  root.dataset.look = rootTheme;

  if (!originalSelector) return;

  const wrapper = originalSelector.closest(".sidebar-theme");
  if (!wrapper) return;

  const originalLabel = wrapper.querySelector('label[for="sidebar-theme-selector"]');
  if (originalLabel) {
    originalLabel.htmlFor = THEME_SELECTOR_ID;
    setTextIfChanged(originalLabel, "Ambiance");
  }

  let visibleSelector = document.getElementById(THEME_SELECTOR_ID);
  if (!visibleSelector) {
    visibleSelector = document.createElement("select");
    visibleSelector.id = THEME_SELECTOR_ID;
    visibleSelector.className = "cc-look-selector";
    visibleSelector.setAttribute("aria-label", "Choisir l'ambiance visuelle");

    Object.entries(THEME_LABELS).forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      visibleSelector.appendChild(option);
    });

    visibleSelector.addEventListener("change", () => {
      const nextTheme = visibleSelector.value;
      if (!SUPPORTED_THEMES.has(nextTheme)) return;
      originalSelector.value = nextTheme;
      originalSelector.dispatchEvent(new Event("change", { bubbles: true }));
    });

    originalSelector.insertAdjacentElement("afterend", visibleSelector);
  }

  if (visibleSelector.value !== selectedTheme) visibleSelector.value = selectedTheme;

  if (!SUPPORTED_THEMES.has(originalSelector.value) && pendingThemeNormalization !== selectedTheme) {
    pendingThemeNormalization = selectedTheme;
    requestAnimationFrame(() => {
      const currentSelector = document.getElementById("sidebar-theme-selector");
      if (!currentSelector || SUPPORTED_THEMES.has(currentSelector.value)) {
        pendingThemeNormalization = "";
        return;
      }
      currentSelector.value = selectedTheme;
      currentSelector.dispatchEvent(new Event("change", { bubbles: true }));
    });
  } else if (SUPPORTED_THEMES.has(originalSelector.value)) {
    pendingThemeNormalization = "";
  }
}

function sessionStatus(card) {
  const field = [...card.querySelectorAll(".inline-field")]
    .find((item) => normalize(item.querySelector("label")?.textContent) === "statut");
  const select = field?.querySelector("select");
  if (select) return normalize(select.value);

  const line = [...card.querySelectorAll(".small")]
    .find((item) => normalize(item.textContent).startsWith("statut :"));
  return normalize(line?.textContent).replace("statut :", "").trim();
}

function hasNoPassport(row) {
  return normalize(row.dataset.passport) === "sans";
}

function updateHatching() {
  const cards = [
    ...document.querySelectorAll(".session-card"),
    ...document.querySelectorAll(".grid.five > .card > .stack > .subcard"),
  ];

  cards.forEach((card) => {
    const isFree = sessionStatus(card) === "libre";
    card.querySelectorAll(".passport-row").forEach((row) => {
      row.classList.toggle("passport-warning-hatched", isFree && hasNoPassport(row));
    });
  });
}

function updateFaq() {
  // Le contenu de la FAQ est maintenant maintenu directement dans le composant React.
  // Les sections <details> restent fermées par défaut et s'ouvrent au clic sur la question.
}

function enableHorizontalSwipe() {
  let startX = 0;
  let startY = 0;
  let tracking = false;

  document.addEventListener("touchstart", (event) => {
    const target = event.target;
    if (!(target instanceof Element)
      || target.closest("button,input,select,textarea,a,.modal-overlay,.sidebar")
      || !document.querySelector(".date-nav")) return;

    const touch = event.touches[0];
    if (!touch) return;

    startX = touch.clientX;
    startY = touch.clientY;
    tracking = true;
  }, { passive: true });

  document.addEventListener("touchend", (event) => {
    if (!tracking) return;
    tracking = false;

    const touch = event.changedTouches[0];
    if (!touch) return;

    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    if (Math.abs(deltaX) < 60 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.25) return;

    const buttons = [...document.querySelectorAll(".date-nav .nav-symbol")];
    if (buttons.length >= 2) (deltaX < 0 ? buttons.at(-1) : buttons[0])?.click();
  }, { passive: true });
}

function refresh() {
  if (scheduled) return;
  scheduled = true;

  requestAnimationFrame(() => {
    scheduled = false;
    configureThemeSelector();
    preserveFunctionalRouteColors();
    normalizeWeekView();
    updateHatching();
    updateFaq();
  });
}

function start() {
  refresh();
  enableHorizontalSwipe();

  new MutationObserver(refresh)
    .observe(document.body, { childList: true, subtree: true });

  new MutationObserver(refresh)
    .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  document.addEventListener("change", refresh, true);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
