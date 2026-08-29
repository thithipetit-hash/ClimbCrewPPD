/**
 * Ajustements DOM historiques encore nécessaires à ClimbCrew.
 *
 * Le thème, la FAQ et les couleurs fonctionnelles des voies sont désormais
 * entièrement gérés par React et les feuilles CSS.
 * Ce module ne conserve plus que les compatibilités encore dépendantes du DOM :
 * - ordre des séances dans la vue semaine ;
 * - hachurage des inscriptions incompatibles avec une séance libre ;
 * - navigation tactile horizontale.
 */
const SLOT_ORDER = ["midi", "soir", "matin"];

let scheduled = false;

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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
    normalizeWeekView();
    updateHatching();
  });
}

function start() {
  refresh();
  enableHorizontalSwipe();

  new MutationObserver(refresh)
    .observe(document.body, { childList: true, subtree: true });

  document.addEventListener("change", refresh, true);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
