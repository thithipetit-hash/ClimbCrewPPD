/**
 * Ajustements DOM historiques encore nécessaires à ClimbCrew.
 *
 * Le thème, la FAQ, les couleurs fonctionnelles des voies et l'ordre des séances
 * de la vue semaine sont désormais entièrement gérés par React et les feuilles CSS.
 * Ce module ne conserve plus que les compatibilités encore dépendantes du DOM :
 * - hachurage des inscriptions incompatibles avec une séance libre ;
 * - navigation tactile horizontale.
 */
let scheduled = false;

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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
