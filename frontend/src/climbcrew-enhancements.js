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

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @import url("https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap");

    /* Jetons communs : les couleurs fonctionnelles ne changent jamais. */
    :root {
      --passport-sans-bg:#334155; --passport-sans-fg:#f8fafc;
      --passport-jaune-bg:#fde047; --passport-jaune-fg:#111827;
      --passport-orange-bg:#fb923c; --passport-orange-fg:#111827;
      --passport-vert-bg:#22c55e; --passport-vert-fg:#052e16;
      --passport-bleu-bg:#60a5fa; --passport-bleu-fg:#0f172a;
      --passport-decouverte-bg:#64748b; --passport-decouverte-fg:#ffffff;
      --cotis-paid:#22c55e; --cotis-unpaid:#ef4444;
    }

    /* Les composants consomment les mêmes jetons, quelle que soit l'ambiance. */
    :root {
      --theme-page-bg:var(--cc-bg)!important;
      --theme-app-bg:var(--cc-bg)!important;
      --theme-card-bg:var(--cc-surface)!important;
      --theme-card-soft:var(--cc-surface-2)!important;
      --theme-card-border:var(--cc-hairline)!important;
      --theme-text:var(--cc-ink)!important;
      --theme-text-muted:var(--cc-muted)!important;
      --theme-input-bg:var(--cc-surface)!important;
      --theme-input-border:var(--cc-hairline)!important;
      --theme-sidebar-bg:var(--cc-surface)!important;
      --theme-accent:var(--cc-accent)!important;
      --theme-accent-text:var(--cc-accent-text)!important;
      --theme-stat-bg:var(--cc-surface-2)!important;
    }

    /* 1. Craie & Ardoise */
    :root, :root[data-theme="craie_ardoise"] {
      --cc-bg:#F4F1EA; --cc-surface:#FFFFFB; --cc-surface-2:#E8E3D9;
      --cc-ink:#252A2E; --cc-muted:#676B6D; --cc-accent:#C56A3D;
      --cc-accent-strong:#A94F28; --cc-accent-text:#FFFFFF;
      --cc-hairline:rgba(37,42,46,.16); --cc-topo-opacity:.18;
    }

    /* 2. Océan minéral */
    :root[data-theme="ocean_mineral"] {
      --cc-bg:#EAF4F4; --cc-surface:#F8FFFF; --cc-surface-2:#D5EBEA;
      --cc-ink:#102A43; --cc-muted:#536C78; --cc-accent:#1F7A8C;
      --cc-accent-strong:#155E6D; --cc-accent-text:#FFFFFF;
      --cc-hairline:rgba(16,42,67,.15); --cc-topo-opacity:.17;
    }

    /* 3. Forêt mousse */
    :root[data-theme="foret_mousse"] {
      --cc-bg:#E9EFE7; --cc-surface:#F7FAF4; --cc-surface-2:#D5E1D0;
      --cc-ink:#1F2D22; --cc-muted:#5E6C60; --cc-accent:#557A46;
      --cc-accent-strong:#3F6234; --cc-accent-text:#FFFFFF;
      --cc-hairline:rgba(31,45,34,.16); --cc-topo-opacity:.19;
    }

    /* 4. Terre cuite */
    :root[data-theme="terre_cuite"] {
      --cc-bg:#F7EDE5; --cc-surface:#FFFAF6; --cc-surface-2:#EED8C9;
      --cc-ink:#3A2620; --cc-muted:#7C6258; --cc-accent:#C65D3B;
      --cc-accent-strong:#A84327; --cc-accent-text:#FFFFFF;
      --cc-hairline:rgba(58,38,32,.16); --cc-topo-opacity:.18;
    }

    /* 5. Aurore alpine */
    :root[data-theme="aurore_alpine"] {
      --cc-bg:#EAF0F7; --cc-surface:#F9FBFD; --cc-surface-2:#D9E4EF;
      --cc-ink:#162B3A; --cc-muted:#587080; --cc-accent:#315D7D;
      --cc-accent-strong:#244861; --cc-accent-text:#FFFFFF;
      --cc-hairline:rgba(22,43,58,.16); --cc-topo-opacity:.17;
    }

    /* 6. Lavande nocturne */
    :root[data-theme="lavande_nocturne"] {
      --cc-bg:#171525; --cc-surface:#242039; --cc-surface-2:#302A4A;
      --cc-ink:#F3EFFF; --cc-muted:#B9B1CC; --cc-accent:#B8A1FF;
      --cc-accent-strong:#9477F0; --cc-accent-text:#201A30;
      --cc-hairline:rgba(243,239,255,.16); --cc-topo-opacity:.14;
      --theme-input-bg:var(--cc-surface-2)!important;
    }

    /* 7. Sable & Corde */
    :root[data-theme="sable_corde"] {
      --cc-bg:#F2E7D5; --cc-surface:#FCF8F1; --cc-surface-2:#E5D2B7;
      --cc-ink:#352820; --cc-muted:#75665B; --cc-accent:#A56A3F;
      --cc-accent-strong:#85512D; --cc-accent-text:#FFFFFF;
      --cc-hairline:rgba(53,40,32,.16); --cc-topo-opacity:.20;
    }

    /* 8. Bloc néon */
    :root[data-theme="bloc_neon"] {
      --cc-bg:#111318; --cc-surface:#1C2028; --cc-surface-2:#282E39;
      --cc-ink:#F5F7FA; --cc-muted:#AAB2BF; --cc-accent:#C7FF4A;
      --cc-accent-strong:#A8E522; --cc-accent-text:#162000;
      --cc-hairline:rgba(245,247,250,.15); --cc-topo-opacity:.13;
      --theme-input-bg:var(--cc-surface-2)!important;
    }

    /* 9. Glacier */
    :root[data-theme="glacier"] {
      --cc-bg:#EAF7FA; --cc-surface:#FFFFFF; --cc-surface-2:#D8EFF4;
      --cc-ink:#173B4D; --cc-muted:#607985; --cc-accent:#3AAFC4;
      --cc-accent-strong:#23899D; --cc-accent-text:#082F38;
      --cc-hairline:rgba(23,59,77,.15); --cc-topo-opacity:.16;
    }

    /* 10. Cristal */
    :root[data-theme="cristal"] {
      --cc-bg:#F4F0EB; --cc-surface:#FFFFFF; --cc-surface-2:#E8E0D6;
      --cc-ink:#241F20; --cc-muted:#6C6264; --cc-accent:#9E2A2B;
      --cc-accent-strong:#7E2021; --cc-accent-text:#FFFFFF;
      --cc-hairline:rgba(36,31,32,.16); --cc-topo-opacity:.18;
    }

    html,body,.app {
      background:var(--cc-bg)!important;
      color:var(--cc-ink)!important;
      font-family:Inter,Arial,sans-serif!important;
    }

    h1,h2,h3,.sidebar-brand,.brand {
      font-family:"Space Grotesk",Inter,Arial,sans-serif!important;
    }

    .badge,.pill,.date-input,.date-display,.route-card .small {
      font-family:"IBM Plex Mono",ui-monospace,Consolas,monospace!important;
    }

    .hero,.toolbar,.card,.subcard,.stat,.auth-card,.modal-panel,.sidebar,.mobile-bottom-nav,.week-day-card {
      background:var(--cc-surface)!important;
      border-color:var(--cc-hairline)!important;
      color:var(--cc-ink)!important;
    }

    .subcard,.stat,.muted-box,.week-day-header,.view-toggle {
      background:var(--cc-surface-2)!important;
    }

    .small,.label,label,.muted-box,.auth-subtitle,.auth-helper-text {
      color:var(--cc-muted)!important;
    }

    h1,h2,h3,strong { color:var(--cc-ink)!important; }

    input,select,textarea {
      background:var(--theme-input-bg)!important;
      color:var(--cc-ink)!important;
      border-color:var(--cc-hairline)!important;
    }

    input:focus-visible,select:focus-visible,textarea:focus-visible,button:focus-visible,a:focus-visible {
      outline:2px solid var(--cc-accent)!important;
      outline-offset:2px;
    }

    button:not(.danger):not(.remove-button):not(.secondary):not(.ghost),
    .side-tab.active,.bottom-tab.active,.tab.active {
      background:var(--cc-accent)!important;
      color:var(--cc-accent-text)!important;
    }

    button:not(.danger):not(.remove-button):not(.secondary):not(.ghost):hover,
    .side-tab.active:hover,.bottom-tab.active:hover,.tab.active:hover {
      background:var(--cc-accent-strong)!important;
    }

    button.secondary,.side-tab:not(.active),.bottom-tab:not(.active) {
      background:var(--cc-surface-2)!important;
      color:var(--cc-ink)!important;
      border:1px solid var(--cc-hairline)!important;
    }

    button.ghost,.menu-button,.sidebar-close {
      background:transparent!important;
      color:var(--cc-ink)!important;
      border-color:var(--cc-hairline)!important;
    }

    a { color:var(--cc-accent)!important; }

    /* Le bandeau épouse directement son contenu, sans ligne décorative supplémentaire. */
    .hero::after { content:none!important; display:none!important; }

    /* Le choix d'ambiance est visible uniquement dans le menu de gauche. */
    .theme-selector-inline,#header-theme-selector { display:none!important; }
    .sidebar-theme {
      margin-top:4px;
      padding-top:12px;
      border-top:1px solid var(--cc-hairline)!important;
    }
    .sidebar-theme label { margin-bottom:6px!important; }
    .sidebar-theme #sidebar-theme-selector { display:none!important; }
    .sidebar-theme .cc-look-selector { width:100%; }

    /* Vue semaine : une colonne autonome par jour, avec ses propres séances. */
    .week-day-card {
      display:flex!important;
      flex-direction:column!important;
      min-width:0;
    }
    .week-day-header { flex:0 0 auto; }
    .week-day-sessions {
      display:grid!important;
      grid-template-columns:minmax(0,1fr)!important;
      align-content:start!important;
      gap:10px!important;
      width:100%!important;
      min-width:0!important;
    }
    .week-day-sessions > .session-card {
      width:100%!important;
      min-width:0!important;
      margin-top:0!important;
    }

    /* Tous les cadres sont arrondis et les espaces autour des textes sont réduits d'environ 30 %. */
    .app :where(button,input,select,textarea,.card,.toolbar,.subcard,.stat,.muted-box,.participant-row,.route-card,.badge,.pill,.modal-panel,.week-day-card) {
      border-radius:14px!important;
    }
    .hero { padding:6px 8px!important; border-radius:14px!important; }
    .toolbar,.card { margin-top:6px!important; padding:7px!important; }
    .subcard,.stat,.modal-panel { padding:6px!important; }
    .app button { padding:7px 10px!important; }
    .app input,.app select,.app textarea { padding:7px 8px!important; }

    /* Les cases restent compactes quelle que soit l'orientation du téléphone. */
    .app input[type="checkbox"] {
      appearance:auto!important;
      width:18px!important;
      min-width:18px!important;
      max-width:18px!important;
      height:18px!important;
      min-height:18px!important;
      max-height:18px!important;
      padding:0!important;
      margin:0!important;
      flex:0 0 18px!important;
      border-radius:4px!important;
    }
    .app label:has(> input[type="checkbox"]) {
      display:inline-flex!important;
      align-items:center!important;
      gap:5px!important;
      width:auto!important;
      min-height:24px!important;
      white-space:nowrap!important;
    }

    .grid { gap:6px!important; }
    .stack { gap:4px!important; }
    .card-header { gap:4px!important; margin-bottom:4px!important; }
    .app h1,.app h2,.app h3,.app p { margin-top:0!important; margin-bottom:3px!important; }
    .app label { margin:0!important; padding:0!important; line-height:1.1!important; }
    .participant-row { gap:4px!important; min-height:0!important; padding:3px 6px!important; line-height:1.15!important; }
    .participant-identity { display:inline-flex!important; align-items:center!important; gap:6px!important; min-width:0!important; }
    .passport-dot { width:14px!important; min-width:14px!important; height:14px!important; border-radius:999px!important; }
    .participant-name { display:block!important; margin:0!important; padding:0!important; line-height:1.05!important; }
    .session-participant-list .participant-name { font-weight:400!important; }
    .session-participant-list { display:grid!important; grid-template-columns:minmax(0,1fr)!important; gap:2px!important; }
    .session-participant-list .participant-row { min-height:28px!important; padding:2px 3px 2px 6px!important; }
    .session-participant-list .remove-button {
      display:inline-flex!important; align-items:center!important; justify-content:center!important;
      width:24px!important; min-width:24px!important; height:24px!important; min-height:24px!important;
      padding:0!important; font-size:20px!important; line-height:1!important;
      color:inherit!important; background:rgba(148,163,184,.28)!important;
      border:1px solid rgba(148,163,184,.45)!important; border-radius:999px!important; box-shadow:none!important;
    }
    .app .small,.app strong { margin:0!important; padding:0!important; line-height:1.1!important; }
    .app span,.app .label,.app .value,.app .muted-box { line-height:1.1!important; }
    .muted-box { padding-top:4px!important; padding-bottom:4px!important; }
    .badge,.pill { padding:2px 5px!important; border-radius:999px!important; }
    .faq-item { padding:5px 0!important; }
    .session-form-row { gap:6px!important; margin-bottom:6px!important; }
    .subcard>.stack { margin-top:2px!important; }
    .passport-row {
      width:100%!important; box-sizing:border-box!important; justify-content:space-between!important;
      background:transparent!important; border-radius:999px!important;
    }
    .shell { touch-action:pan-y; overscroll-behavior-x:contain; }

    /* Les flèches et la date forment un seul bloc insécable sur toutes les largeurs. */
    .date-nav {
      display:grid!important;
      grid-template-columns:44px minmax(0,1fr) 44px!important;
      align-items:center!important;
      flex-wrap:nowrap!important;
      width:min(100%,440px)!important;
      min-width:0!important;
    }
    .date-nav .date-input {
      grid-column:2!important;
      width:100%!important;
      min-width:0!important;
      max-width:none!important;
    }
    .date-nav .nav-symbol:first-child { grid-column:1!important; }
    .date-nav .nav-symbol:last-child { grid-column:3!important; }
    .date-nav .nav-symbol {
      width:44px!important;
      min-width:44px!important;
      margin:0!important;
    }

    /* Les couleurs de voies et de passeports restent fonctionnelles. */
    .route-card {
      border:2px solid rgba(15,23,42,.38)!important;
      box-shadow:inset 0 0 0 1px rgba(255,255,255,.22)!important;
    }
    .route-card strong,.route-card .small {
      color:inherit!important;
      font-weight:800!important;
      opacity:1!important;
    }
    .route-card .pill {
      background:rgba(255,255,255,.62)!important;
      color:#0f172a!important;
      border:1px solid rgba(15,23,42,.45)!important;
      font-weight:800!important;
    }
    .route-card.moulinette-only {
      border:3px solid #ef4444!important;
      box-shadow:0 0 0 2px rgba(239,68,68,.22)!important;
    }
    .demo-badge {
      display:inline-flex;
      margin-top:4px;
      background:#f59e0b!important;
      color:#111827!important;
      border-color:#92400e!important;
    }
    .passport-warning-hatched {
      background-image:repeating-linear-gradient(135deg,rgba(255,255,255,.32) 0,rgba(255,255,255,.32) 7px,rgba(15,23,42,.18) 7px,rgba(15,23,42,.18) 14px)!important;
      background-blend-mode:overlay;
    }

    /* Sur téléphone, tout le bandeau de commande précédant les inscrits
       utilise une échelle typographique homogène et moins de hauteur. */
    @media (max-width:700px) {
      .hero {
        padding:5px 7px!important;
      }
      .hero h1 {
        font-size:18px!important;
        line-height:1.1!important;
      }
      .toolbar {
        gap:5px!important;
        padding:5px!important;
        margin-top:5px!important;
      }
      .date-nav {
        grid-template-columns:38px minmax(0,1fr) 38px!important;
      }
      .date-nav .nav-symbol,
      .date-nav .date-input {
        min-height:38px!important;
        height:38px!important;
        font-size:14px!important;
        padding:4px 8px!important;
      }
      .date-nav .nav-symbol {
        width:38px!important;
        min-width:38px!important;
      }
      .view-toggle {
        gap:4px!important;
        padding:4px!important;
      }
      .view-toggle button {
        min-height:38px!important;
        padding:5px 8px!important;
        font-size:14px!important;
      }
      /* Tableau des voies : cartes plus denses, sans réduire les informations. */
      .route-card {
        min-height:0!important;
        padding:4px 6px!important;
        margin:0!important;
      }
      .route-card > .card-header {
        display:grid!important;
        grid-template-columns:minmax(0,1fr) auto!important;
        align-items:center!important;
        gap:5px!important;
        margin:0!important;
      }
      .route-card > .card-header > strong {
        min-width:0!important;
        font-size:13px!important;
        line-height:1.2!important;
        overflow-wrap:anywhere;
      }
      .route-card > .card-header > .group {
        display:flex!important;
        justify-content:flex-end!important;
        align-items:center!important;
        flex-wrap:wrap!important;
        gap:3px!important;
      }
      .route-card .pill {
        padding:2px 5px!important;
        font-size:10px!important;
        line-height:1.1!important;
      }
      .route-card button {
        min-height:32px!important;
        padding:3px 7px!important;
        font-size:12px!important;
        line-height:1.1!important;
      }

      .session-card {
        padding:8px!important;
      }
      .session-card > .card-header {
        margin-bottom:3px!important;
      }
      .session-card > .card-header h3 {
        font-size:16px!important;
        line-height:1.1!important;
      }
      .session-card > .card-header .badge {
        font-size:13px!important;
      }
      .session-card .session-form-row {
        gap:4px!important;
        margin-bottom:5px!important;
      }
      .session-card .inline-field {
        grid-template-columns:82px minmax(0,1fr)!important;
        gap:6px!important;
      }
      .session-card .inline-field label {
        font-size:13px!important;
        font-weight:700!important;
        line-height:1.1!important;
      }
      .session-card .inline-field select {
        min-height:38px!important;
        height:38px!important;
        padding:4px 9px!important;
        font-size:14px!important;
        line-height:1.1!important;
      }
    }

    @media (prefers-reduced-motion:reduce) {
      *,*::before,*::after {
        scroll-behavior:auto!important;
        animation-duration:.01ms!important;
        animation-iteration-count:1!important;
        transition-duration:.01ms!important;
      }
    }
  `;

  document.head.appendChild(style);
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
  injectStyles();
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
