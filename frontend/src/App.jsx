import React, { useEffect, useMemo, useState } from "react";
import { normalizeRopeNumber } from "./route-utils.js";
import { APP_VERSION } from "./version.js";
import { normalizeAppData } from "./data-normalization.js";
import {
  GRADES,
  calculateLeadPoints,
  calculateLeadRealisationStats,
  calculateRouteAggregates,
  calculateSimpleCpr,
  calculateWallOfFameCategories,
  gradeToIndex,
} from "./climbing-calculations.js";

// Données de repli volontairement vides : les données legacy sont importées côté backend/PostgreSQL.
// Cela évite d'exposer les participants dans le bundle JavaScript public.
const IMPORTED_DATA = {
  exportedAt: null,
  version: "secure-empty-fallback",
  participants: [],
  sessions: [],
  ropes: [],
  routes: [],
  realisations: [],
  selectedDate: "",
  selectedParticipantProgress: ""
};
const STORAGE_KEY = "climbcrew_local_data_v2";
const ADMIN_CODE = import.meta.env.VITE_LEGACY_ADMIN_CODE || "";
const MAX_PARTICIPANTS = 18;
const API_BASE = (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const USE_API = Boolean(API_BASE);

// La session est conservée uniquement dans un cookie HttpOnly côté backend.
const PASSWORD_RULE_TEXT = "Minimum 12 caractères avec majuscule, minuscule, chiffre et caractère spécial.";

const AUTH_LOGIN_INLINE_STYLE = `
  .auth-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px 14px;
    background: linear-gradient(180deg, #f6f8fc 0%, #eef2f7 100%);
  }

  .auth-card {
    width: min(460px, 100%);
    padding: 18px;
    border-radius: 20px;
    background: rgba(255,255,255,.96);
    border: 1px solid rgba(148,163,184,.18);
    box-shadow: 0 18px 50px rgba(15,23,42,.10);
    color: #0f172a;
  }

  .auth-brand {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: 10px;
  }

  .auth-page .app-logo {
    width: 72px;
    height: 72px;
    object-fit: contain;
    border-radius: 18px;
    background: #ffffff;
    padding: 6px;
    box-shadow: 0 10px 30px rgba(15,23,42,.10);
  }

  .auth-brand h1,
  .auth-brand p {
    margin: 0;
    text-align: center;
  }

  .auth-switcher {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 14px;
  }

  .auth-switcher button {
    min-height: 40px;
    padding: 8px 10px;
    border-radius: 12px;
  }

  .auth-card .grid.two {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .auth-card label {
    display: block;
    margin-bottom: 6px;
    font-size: 12px;
    font-weight: 700;
    color: #64748b;
    text-transform: none;
    letter-spacing: 0;
  }

  .auth-card input,
  .auth-card select {
    width: 100%;
    min-height: 44px;
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid rgba(148,163,184,.25);
    background: #ffffff;
    color: #0f172a;
    box-sizing: border-box;
  }

  .auth-submit-row {
    grid-column: 1 / -1;
    display: flex;
    justify-content: flex-start;
  }

  .auth-submit-row button {
    min-width: 160px;
  }

  @media (max-width: 480px) {
    .auth-card {
      width: min(100%, 380px);
      padding: 14px;
    }

    .auth-page .app-logo {
      width: 64px;
      height: 64px;
    }

    .auth-switcher {
      grid-template-columns: 1fr;
    }

    .auth-submit-row button {
      width: 100%;
      min-width: 0;
    }
  }
`;


const THEME_PREFERENCE_KEY = "climbcrew-theme-preference";
const THEME_OPTIONS = [
  { value: "auto", label: "Automatique" },
  { value: "craie_ardoise", label: "Craie & Ardoise" },
  { value: "ocean_mineral", label: "Océan minéral" },
  { value: "foret_mousse", label: "Forêt mousse" },
  { value: "terre_cuite", label: "Terre cuite" },
  { value: "aurore_alpine", label: "Aurore alpine" },
  { value: "lavande_nocturne", label: "Lavande nocturne" },
  { value: "sable_corde", label: "Sable & Corde" },
  { value: "bloc_neon", label: "Bloc néon" },
  { value: "glacier", label: "Glacier" },
  { value: "cristal", label: "Cristal" },
];
const THEME_VALUES = THEME_OPTIONS.filter((option) => option.value !== "auto").map((option) => option.value);

function getSystemTheme() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "craie_ardoise";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "lavande_nocturne" : "craie_ardoise";
}

function resolveThemePreference(value) {
  if (THEME_VALUES.includes(value)) return value;
  if (value === "light") return "craie_ardoise";
  if (value === "dark") return "lavande_nocturne";
  if (value === "fun") return "bloc_neon";
  return getSystemTheme();
}


function isStrongPassword(value) {
  return typeof value === "string"
    && value.length >= 12
    && /[a-z]/.test(value)
    && /[A-Z]/.test(value)
    && /\d/.test(value)
    && /[^A-Za-z0-9]/.test(value);
}


const TABS = [
  { key: "inscriptions", label: "Inscriptions" },
  { key: "voies", label: "Voies" },
  { key: "progression", label: "Progression" },
  { key: "administration", label: "Administration", adminOnly: true },
  { key: "gestion_comptes", label: "Gestion des comptes", adminOnly: true },
  { key: "logs", label: "Log", adminOnly: true },
  { key: "statistiques", label: "Statistiques" },
  { key: "wall_of_fame", label: "Wall of Fame" },
  { key: "faq", label: "FAQ" },
];

const PASSPORT_STYLES = {
  sans: { backgroundColor: "#334155", color: "#f8fafc" },
  jaune: { backgroundColor: "#fde047", color: "#111827" },
  orange: { backgroundColor: "#fb923c", color: "#111827" },
  vert: { backgroundColor: "#22c55e", color: "#052e16" },
  bleu: { backgroundColor: "#60a5fa", color: "#0f172a" },

  // Passeport découverte : fond gris.
  // Le cadre dépend ensuite du statut cotisation.
  decouverte: { backgroundColor: "#64748b", color: "#ffffff" },
  "découverte": { backgroundColor: "#64748b", color: "#ffffff" },
  decouvertes: { backgroundColor: "#64748b", color: "#ffffff" },
  "découvertes": { backgroundColor: "#64748b", color: "#ffffff" },
};

const ROPE_NUMBERS = Array.from({ length: 22 }, (_, index) => index);
const ROUTE_COLORS = ["Blanc", "Bleu", "Gris", "Jaune", "Marron", "Noir", "Ocre", "Orange", "Rose", "Rouge", "Vert", "Violet"];
const STYLE_LABELS = {
  a_vue: "À vue",
  flash: "Flash",
  en_tete: "En tête",
  moulinette: "En moulinette",
  avec_repos: "Avec repos",
  travaillee: "Travaillée",
  projet: "Projet",
  non_enchainee: "Non enchaînée",
  test: "Essai / test",
};
function fullName(p) {
  return p ? `${p.nom} ${p.prenom}`.trim() : "";
}

function formatRouteName(route) {
  const opener = String(route?.nomOuvreur || "").trim();
  const name = String(route?.nomVoie || "").trim();
  const label = [opener, name].filter(Boolean).join(" · ");
  return label || "Voie";
}

function toLocalIso(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayIso() {
  const date = new Date();
  const day = date.getDay();

  // Si l'application est ouverte le week-end, on positionne directement
  // la vue sur le prochain lundi, car les séances sont en semaine.
  if (day === 6) date.setDate(date.getDate() + 2);
  if (day === 0) date.setDate(date.getDate() + 1);

  return toLocalIso(date);
}

/**
 * Règle de création automatique des séances :
 * - toutes les séances sont libres par défaut ;
 * - les séances du mardi midi et du jeudi midi sont encadrées.
 */
function defaultSessionStatus(dateStr, slot) {
  const day = new Date(`${dateStr}T12:00:00`).getDay();
  return slot === "midi" && (day === 2 || day === 4) ? "encadree" : "libre";
}

function normalizePassport(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isDiscoveryPassport(passport) {
  const normalized = normalizePassport(passport);
  return normalized === "decouverte" || normalized === "decouvertes";
}

function getPassportStyle(participant) {
  const baseStyle = isDiscoveryPassport(participant?.passport)
    ? PASSPORT_STYLES.decouverte
    : PASSPORT_STYLES[participant?.passport] || PASSPORT_STYLES.sans;

  const isCotisant = Boolean(participant?.cotisation);
  const hasFfmeLicence = Boolean(participant?.ffme);
  const borderColor = isCotisant ? "#22c55e" : "#ef4444";

  return {
    color: "inherit",
    background: "transparent",
    border: `2px ${hasFfmeLicence ? "solid" : "dashed"} ${borderColor}`,
    boxShadow: isCotisant
      ? "0 0 0 1px rgba(34,197,94,.18)"
      : "0 0 0 1px rgba(239,68,68,.18)",
  };
}

function getPassportDotStyle(participant) {
  const baseStyle = isDiscoveryPassport(participant?.passport)
    ? PASSPORT_STYLES.decouverte
    : PASSPORT_STYLES[participant?.passport] || PASSPORT_STYLES.sans;

  return { backgroundColor: baseStyle.backgroundColor };
}
function getRouteBackgroundColor(color) {
  const normalized = String(color || "").trim().toLowerCase();
  const map = {
    bleu: "#60a5fa", blue: "#60a5fa", rouge: "#f87171", red: "#f87171",
    vert: "#4ade80", green: "#4ade80", jaune: "#facc15", yellow: "#facc15",
    orange: "#fb923c", violet: "#a78bfa", purple: "#a78bfa", rose: "#f472b6",
    pink: "#f472b6", noir: "#94a3b8", black: "#94a3b8", blanc: "#f8fafc",
    white: "#f8fafc", ocre: "#8b5a2b", ochre: "#8b5a2b", marron: "#8b5a2b", brown: "#8b5a2b",
    gris: "#cbd5e1", gray: "#cbd5e1", grey: "#cbd5e1",
  };
  return map[normalized] || "#f8fafc";
}
function getContrastingTextColor(backgroundColor) {
  const hex = String(backgroundColor || "").trim().replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return "#0f172a";
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 160 ? "#0f172a" : "#f8fafc";
}
function getRouteCardStyle(color) {
  const backgroundColor = getRouteBackgroundColor(color);
  const normalizedColor = normalizePassport(color);
  return {
    backgroundColor,
    color: ["blanc", "white"].includes(normalizedColor)
      ? "#0f172a"
      : getContrastingTextColor(backgroundColor),
  };
}
function formatDateFr(dateStr) {
  const formatted = new Date(`${dateStr}T12:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function formatDateShortFr(dateStr) {
  const [year, month, day] = String(dateStr || "").slice(0, 10).split("-");
  return year && month && day ? `${day}-${month}-${year}` : String(dateStr || "");
}

function formatPoints(value) {
  return Number(value || 0).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
}

function isWeekend(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  const day = d.getDay();
  return day === 0 || day === 6;
}
function nextBusinessDay(dateStr, delta) {
  const d = new Date(`${dateStr}T12:00:00`);
  do { d.setDate(d.getDate() + delta); } while (d.getDay() === 0 || d.getDay() === 6);
  return d.toISOString().slice(0, 10);
}
function downloadFile(filename, content, type = "application/json;charset=utf-8;") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function readCookie(name) {
  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1) || "";
}

function csrfHeaders(method = "GET") {
  const upperMethod = String(method || "GET").toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(upperMethod)) return {};
  const csrfToken = readCookie("climbcrew_csrf");
  return csrfToken ? { "X-CSRF-Token": csrfToken } : {};
}

async function apiFetch(path, options = {}) {
  const method = options.method || "GET";
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...csrfHeaders(method),
      ...(options.headers || {})
    },
    ...options,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Erreur API ${response.status}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function authApiFetch(path, _token, options = {}) {
  // Authentification par cookie HttpOnly uniquement : aucun jeton n'est stocké dans localStorage.
  return apiFetch(path, options);
}

function App() {
  const [tab, setTab] = useState("inscriptions");
  const [viewMode, setViewMode] = useState("jour");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [statsSortField, setStatsSortField] = useState("name");
  const [statsSortDirection, setStatsSortDirection] = useState("asc");
  const [recentlyAddedParticipantIds, setRecentlyAddedParticipantIds] = useState([]);
  const [state, setState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const base = saved ? JSON.parse(saved) : IMPORTED_DATA;
      return normalizeAppData({
        ...base,
        selectedDate: todayIso(),
        selectedParticipantProgress: "",
      }, IMPORTED_DATA);
    } catch {
      return normalizeAppData({
        ...IMPORTED_DATA,
        selectedDate: todayIso(),
        selectedParticipantProgress: "",
      }, IMPORTED_DATA);
    }
  });
  const [adminInput, setAdminInput] = useState("");
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [routeError, setRouteError] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [, setSyncMessage] = useState(USE_API ? "API activée" : "Mode local");
  const [isSyncing, setIsSyncing] = useState(false);

  const [authToken, setAuthToken] = useState(() => (USE_API ? "cookie" : ""));
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(USE_API);
  const [authView, setAuthView] = useState("login");
  const [authError, setAuthError] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [loginForm, setLoginForm] = useState({
    email: "",
    password: "",
  });
  const [requestAccessForm, setRequestAccessForm] = useState({
    prenom: "",
    nom: "",
    email: "",
    password: "",
    confirmPassword: "",
    acceptTerms: false,
  });
  const [forgotPasswordForm, setForgotPasswordForm] = useState({
    email: "",
  });
  const [resetPasswordForm, setResetPasswordForm] = useState({
    email: "",
    token: "",
    password: "",
    confirmPassword: "",
  });
  const [adminAuthUsers, setAdminAuthUsers] = useState([]);
  const [adminAccessLogs, setAdminAccessLogs] = useState([]);
  const [generatedResetToken, setGeneratedResetToken] = useState("");
  const [themePreference, setThemePreference] = useState(() => localStorage.getItem(THEME_PREFERENCE_KEY) || "auto");

  const [newParticipant, setNewParticipant] = useState({
    nom: "",
    prenom: "",
    email: "",
    passport: "sans",
    cotisation: false,
    ffme: false,
    canEncadrer: false,
    canReferer: false,
    canAdmin: false,
  });
  const [newRoute, setNewRoute] = useState({
    numeroCorde: "1",
    couleurPrises: "Blanc",
    cotationReference: "5c",
    nomVoie: "",
    nomOuvreur: "",
    moulinetteOnly: false,
  });
  const [editingRouteId, setEditingRouteId] = useState("");
  const [routeEditDraft, setRouteEditDraft] = useState(null);
  // Le tableau peut être regroupé soit par numéro de corde, soit par niveau de cotation.
  const [routeSortMode, setRouteSortMode] = useState("corde");
  const [newRealisation, setNewRealisation] = useState({
    participantId: "",
    selectedDay: "",
    sessionId: "",
    voieId: IMPORTED_DATA.routes?.[0]?.id || "",
    styleRealisation: "a_vue",
    commentaire: "",
    cotationProposee: "",
  });

  // Route sélectionnée pour le popup "Enregistrer une réalisation"
  // depuis l'onglet Voies.
  const [realisationModalRouteId, setRealisationModalRouteId] = useState(null);

  // Filtres de consultation et voie choisie pour une nouvelle réalisation depuis Progression.
  const [selectedRouteProgress, setSelectedRouteProgress] = useState("");
  const [progressEntryRouteId, setProgressEntryRouteId] = useState("");

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    const applyTheme = () => {
      const resolvedTheme = resolveThemePreference(themePreference);
      document.documentElement.dataset.theme = resolvedTheme;
      document.documentElement.dataset.themePreference = themePreference;
      localStorage.setItem(THEME_PREFERENCE_KEY, themePreference);
    };

    applyTheme();

    if (themePreference !== "auto" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemThemeChange = () => applyTheme();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", onSystemThemeChange);
      return () => mediaQuery.removeEventListener("change", onSystemThemeChange);
    }

    mediaQuery.addListener(onSystemThemeChange);
    return () => mediaQuery.removeListener(onSystemThemeChange);
  }, [themePreference]);

  /**
   * Recharge toutes les données depuis le backend.
   * Important : les anciennes versions ne rechargeaient que participants/séances/réalisations.
   * Les cordes et voies sont maintenant rechargées aussi pour conserver les couleurs
   * de passeports, couleurs de cordes et couleurs de voies importées depuis le legacy.
   */
  async function reloadApiState({ isMounted = () => true } = {}) {
    setIsSyncing(true);
    try {
      const [participants, sessions, realisations, ropes, routes] = await Promise.all([
        apiFetch("/participants"),
        apiFetch("/sessions"),
        apiFetch("/realisations").catch(() => []),
        apiFetch("/ropes").catch(() => []),
        apiFetch("/routes").catch(() => []),
      ]);

      if (!isMounted()) return null;

      setState((prev) => normalizeAppData({
        ...prev,
        participants: Array.isArray(participants) ? participants : prev.participants,
        sessions: Array.isArray(sessions) && sessions.length ? sessions : prev.sessions,
        realisations: Array.isArray(realisations) ? realisations : prev.realisations,
        ropes: Array.isArray(ropes) && ropes.length ? ropes : prev.ropes,
        routes: Array.isArray(routes) && routes.length ? routes : prev.routes,
      }, prev));

      setSyncMessage("Données actualisées");
      return { participants, sessions, realisations, ropes, routes };
    } catch (e) {
      if (isMounted()) {
        setSyncMessage(`API indisponible · fallback local`);
        console.error(e);
      }
      throw e;
    } finally {
      if (isMounted()) setIsSyncing(false);
    }
  }

  useEffect(() => {
    if (!USE_API) return;
    let mounted = true;
    reloadApiState({ isMounted: () => mounted }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!USE_API) {
      setAuthLoading(false);
      return;
    }

    let isMounted = true;
    (async () => {
      try {
        setAuthLoading(true);
        const data = await authApiFetch("/auth/me", authToken);
        if (!isMounted) return;
        setAuthUser(data.user);
        if (data.user?.theme_preference) {
          setThemePreference(data.user.theme_preference);
        }
        if (data.user?.role === "admin") {
          setAdminUnlocked(true);
        }
        await reloadApiState({ isMounted: () => isMounted }).catch(() => {});
      } catch (error) {
        if (!isMounted) return;
        setAuthUser(null);
        setAuthToken("");
      } finally {
        if (isMounted) setAuthLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [authToken]);

  const canAccessAdminTabs = !USE_API || authUser?.role === "admin";
  const canManageAccountsAndLogs = USE_API && authUser?.role === "admin";
  const visibleTabs = useMemo(
    () => TABS.filter((item) => !item.adminOnly || canAccessAdminTabs),
    [canAccessAdminTabs]
  );
  const currentPageLabel = TABS.find((item) => item.key === tab)?.label || "";

  useEffect(() => {
    if (visibleTabs.some((item) => item.key === tab)) return;
    setTab("inscriptions");
  }, [tab, visibleTabs]);

  useEffect(() => {
    if (canManageAccountsAndLogs && ["administration", "gestion_comptes", "logs"].includes(tab)) {
      loadAdminAccessData();
    }
  }, [tab, canManageAccountsAndLogs, authToken]);

  const participantsById = useMemo(
    () => Object.fromEntries(state.participants.map((p) => [p.id, p])),
    [state.participants]
  );
  const routesById = useMemo(
    () => Object.fromEntries(state.routes.map((r) => [r.id, r])),
    [state.routes]
  );

  // Prépare les groupes du tableau des voies. L'ordre des cotations suit GRADES
  // afin que 6a+ soit placé entre 6a et 6b.
  const routeDisplayGroups = useMemo(() => {
    if (routeSortMode === "cotation") {
      const gradeRank = new Map(GRADES.map((grade, index) => [grade, index]));
      const grades = [...new Set(state.routes.map((route) => route.cotationAjustee || route.cotationReference || "nc"))]
        .sort((gradeA, gradeB) => {
          const rankA = gradeRank.has(gradeA) ? gradeRank.get(gradeA) : Number.MAX_SAFE_INTEGER;
          const rankB = gradeRank.has(gradeB) ? gradeRank.get(gradeB) : Number.MAX_SAFE_INTEGER;
          return rankA - rankB || String(gradeA).localeCompare(String(gradeB), "fr");
        });

      return grades.map((grade) => ({
        key: `cotation-${grade}`,
        label: `Cotation ${grade}`,
        routes: state.routes.filter((route) => (route.cotationAjustee || route.cotationReference || "nc") === grade),
      }));
    }

    return [...new Set(state.routes.map((route) => normalizeRopeNumber(route.numeroCorde)))]
      .sort((numeroA, numeroB) => numeroA - numeroB)
      .map((numeroCorde) => {
        const rope = state.ropes.find((item) => normalizeRopeNumber(item.numeroCorde) === numeroCorde);
        return {
          key: `corde-${numeroCorde}`,
          label: `Corde ${numeroCorde}${rope?.couleurCorde ? ` · ${rope.couleurCorde}` : ""}`,
          routes: state.routes.filter((route) => normalizeRopeNumber(route.numeroCorde) === numeroCorde),
        };
      });
  }, [routeSortMode, state.routes, state.ropes]);
  const sessionsById = useMemo(
    () => Object.fromEntries(state.sessions.map((s) => [s.id, s])),
    [state.sessions]
  );

  const realisationModalRoute = realisationModalRouteId ? routesById[realisationModalRouteId] : null;

  const sortedSessionsByDate = useMemo(() => {
    return [...state.sessions].sort((a, b) => {
      const dateCompare = b.date.localeCompare(a.date);
      if (dateCompare !== 0) return dateCompare;
      return a.slot.localeCompare(b.slot);
    });
  }, [state.sessions]);

  function isManagedSession(session) {
    if (["passeport", "challenge", "renouvellement"].includes(session.status)) return true;
    return (session.status === "encadree" && Boolean(session.encadrantId))
      || (session.status === "libre" && Boolean(session.referentId));
  }

  const modalAllAvailableDays = useMemo(() => {
    return [...new Set(
      sortedSessionsByDate
        .filter(isManagedSession)
        .map((session) => session.date)
    )];
  }, [sortedSessionsByDate]);

  function getParticipantSessionDays(participantId) {
    if (!participantId) return [];

    return [...new Set(
      state.sessions
        .filter(isManagedSession)
        .filter((session) => session.participantIds?.includes(participantId))
        .map((session) => session.date)
    )].sort((a, b) => b.localeCompare(a));
  }

  const modalAllEligibleParticipants = useMemo(() => {
    return [...state.participants]
      .filter((participant) => Boolean(participant.cotisation))
      .filter((participant) => getParticipantSessionDays(participant.id).length > 0)
      .sort((a, b) => fullName(a).localeCompare(fullName(b), "fr"));
  }, [state.participants, state.sessions]);

  const modalAvailableDays = useMemo(() => {
    if (!newRealisation.participantId) return modalAllAvailableDays;
    return getParticipantSessionDays(newRealisation.participantId);
  }, [newRealisation.participantId, modalAllAvailableDays, state.sessions]);

  const modalEligibleParticipants = useMemo(() => {
    if (!newRealisation.selectedDay) return modalAllEligibleParticipants;

    const participantIdsForSelectedDay = new Set(
      state.sessions
        .filter((session) => session.date === newRealisation.selectedDay)
        .filter(isManagedSession)
        .flatMap((session) => session.participantIds || [])
    );

    return modalAllEligibleParticipants.filter((participant) => participantIdsForSelectedDay.has(participant.id));
  }, [newRealisation.selectedDay, modalAllEligibleParticipants, state.sessions]);

  const selectedDate = state.selectedDate || todayIso();

  const daySessions = useMemo(() => {
    return ["midi", "soir", "matin"].map((slot) => {
      const found = state.sessions.find((s) => s.date === selectedDate && s.slot === slot);
      return found || {
        id: `${selectedDate}-${slot}`,
        date: selectedDate,
        slot,
        status: defaultSessionStatus(selectedDate, slot),
        encadrantId: null,
        referentId: null,
        participantIds: [],
      };
    });
  }, [selectedDate, state.sessions]);

  const weekDates = useMemo(() => {
    const current = new Date(`${selectedDate}T12:00:00`);
    const day = current.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(current);
    monday.setDate(current.getDate() + diff);
    return Array.from({ length: 5 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d.toISOString().slice(0, 10);
    });
  }, [selectedDate]);

  const weekSessions = useMemo(() => {
    return weekDates.map((date) => ({
      date,
      sessions: ["midi", "soir", "matin"].map((slot) => {
        const found = state.sessions.find((s) => s.date === date && s.slot === slot);
        return found || {
          id: `${date}-${slot}`,
          date,
          slot,
          status: defaultSessionStatus(date, slot),
          encadrantId: null,
          referentId: null,
          participantIds: [],
        };
      }),
    }));
  }, [weekDates, state.sessions]);

  const selectedParticipantRealisations = useMemo(() => {
    return state.realisations
      .filter((r) => r.participantId === state.selectedParticipantProgress)
      .sort((a, b) => a.dateRealisation.localeCompare(b.dateRealisation));
  }, [state.realisations, state.selectedParticipantProgress]);

  const participantProgressStats = useMemo(() => {
    const gradesAll = selectedParticipantRealisations.map((r) => routesById[r.voieId]?.cotationAjustee).filter(Boolean);
    const bestAll = gradesAll.length
      ? gradesAll.reduce((best, current) => (gradeToIndex(current) > gradeToIndex(best) ? current : best))
      : null;

    return {
      count: selectedParticipantRealisations.length,
      bestAll,
      cpr: calculateSimpleCpr(selectedParticipantRealisations, routesById),
    };
  }, [selectedParticipantRealisations, routesById]);

  const selectedRouteRealisations = useMemo(() => {
    if (!selectedRouteProgress) return [];
    return state.realisations
      .filter((realisation) => realisation.voieId === selectedRouteProgress)
      .sort((a, b) => b.dateRealisation.localeCompare(a.dateRealisation));
  }, [state.realisations, selectedRouteProgress]);

  const progressViewRealisations = state.selectedParticipantProgress
    ? [...selectedParticipantRealisations].sort((a, b) => b.dateRealisation.localeCompare(a.dateRealisation))
    : selectedRouteRealisations;

  const sessionStats = useMemo(() => {
    const unique = new Set(state.sessions.flatMap((s) => s.participantIds));
    const participationCount = {};
    state.sessions.forEach((session) => {
      session.participantIds.forEach((id) => {
        participationCount[id] = (participationCount[id] || 0) + 1;
      });
    });
    return {
      nombreInscrits: unique.size,
      nombreCotisations: state.participants.filter((p) => p.cotisation).length,
      nombreFFME: state.participants.filter((p) => p.ffme).length,
      nombreRealisations: state.realisations.length,
      nombreVoiesActives: state.routes.filter((r) => r.active).length,
      participationCount,
      sortedParticipants: [...state.participants].sort((a, b) => fullName(a).localeCompare(fullName(b), "fr")),
    };
  }, [state]);

  // Statistiques des réalisations en tête par cotation de voie.
  const leadRealisationStats = useMemo(
    () => calculateLeadRealisationStats(
      state.routes,
      state.realisations,
      routesById,
    ),
    [state.routes, state.realisations, routesById],
  );

  const alphabeticalParticipants = useMemo(() => {
    return [...state.participants].sort((a, b) => fullName(a).localeCompare(fullName(b), "fr"));
  }, [state.participants]);

  const cprByParticipantId = useMemo(() => {
    return Object.fromEntries(
      state.participants.map((participant) => [
        participant.id,
        calculateSimpleCpr(
          state.realisations.filter((realisation) => String(realisation.participantId) === String(participant.id)),
          routesById
        ),
      ])
    );
  }, [state.participants, state.realisations, routesById]);

  const pointsByParticipantId = useMemo(
    () => calculateLeadPoints(
      state.participants,
      state.routes,
      state.realisations,
    ),
    [state.participants, state.routes, state.realisations],
  );

  // Classements publics du Wall of Fame calculés hors du composant React.
  const wallOfFameCategories = useMemo(
    () => calculateWallOfFameCategories({
      participants: state.participants,
      realisations: state.realisations,
      routesById,
      cprByParticipantId,
      pointsByParticipantId,
      participationCount: sessionStats.participationCount,
    }),
    [
      state.participants,
      state.realisations,
      routesById,
      cprByParticipantId,
      pointsByParticipantId,
      sessionStats.participationCount,
    ],
  );

  const sortedStatsParticipants = useMemo(() => {
    const direction = statsSortDirection === "asc" ? 1 : -1;
    return [...state.participants].sort((a, b) => {
      let left;
      let right;

      if (statsSortField === "name") {
        left = fullName(a);
        right = fullName(b);
        return left.localeCompare(right, "fr") * direction;
      }

      if (statsSortField === "passport") {
        left = a.passport || "";
        right = b.passport || "";
        return left.localeCompare(right, "fr") * direction;
      }

      if (statsSortField === "cotisation") {
        left = a.cotisation ? 1 : 0;
        right = b.cotisation ? 1 : 0;
        return (left - right) * direction;
      }

      if (statsSortField === "ffme") {
        left = a.ffme ? 1 : 0;
        right = b.ffme ? 1 : 0;
        return (left - right) * direction;
      }

      if (statsSortField === "cpr") {
        left = cprByParticipantId[a.id]?.averageIndex;
        right = cprByParticipantId[b.id]?.averageIndex;
        const normalizedLeft = Number.isFinite(left) ? left : -1;
        const normalizedRight = Number.isFinite(right) ? right : -1;
        return (normalizedLeft - normalizedRight) * direction;
      }

      if (statsSortField === "points") {
        left = pointsByParticipantId[a.id] || 0;
        right = pointsByParticipantId[b.id] || 0;
        return (left - right) * direction;
      }

      if (statsSortField === "participations") {
        left = sessionStats.participationCount[a.id] || 0;
        right = sessionStats.participationCount[b.id] || 0;
        return (left - right) * direction;
      }

      return fullName(a).localeCompare(fullName(b), "fr") * direction;
    });
  }, [state.participants, sessionStats.participationCount, cprByParticipantId, pointsByParticipantId, statsSortField, statsSortDirection]);

  const adminParticipants = useMemo(() => {
    const recentSet = new Set(recentlyAddedParticipantIds.map(String));
    const recentParticipants = recentlyAddedParticipantIds
      .map((id) => state.participants.find((p) => String(p.id) === String(id)))
      .filter(Boolean);

    const alphabeticalParticipants = state.participants
      .filter((p) => !recentSet.has(String(p.id)))
      .sort((a, b) => fullName(a).localeCompare(fullName(b), "fr"));

    return [...recentParticipants, ...alphabeticalParticipants];
  }, [state.participants, recentlyAddedParticipantIds]);

  const routeAggregatesById = useMemo(
    () => calculateRouteAggregates(
      state.routes,
      state.realisations,
      cprByParticipantId,
    ),
    [state.routes, state.realisations, cprByParticipantId],
  );

  function setSelectedDate(date) {
    setState((prev) => ({ ...prev, selectedDate: date }));
  }

  function buildDefaultSession(sessionId, patch = {}) {
    const slot = sessionId.endsWith("-soir") ? "soir" : sessionId.endsWith("-matin") ? "matin" : "midi";
    const date = sessionId.slice(0, 10);
    return {
      id: sessionId,
      date,
      slot,
      status: defaultSessionStatus(date, slot),
      encadrantId: null,
      referentId: null,
      participantIds: [],
      ...patch,
    };
  }

  async function syncSessionToApi(session) {
    if (!USE_API || !session) return;
    try {
      await apiFetch(`/sessions/${encodeURIComponent(session.id)}`, {
        method: "PUT",
        body: JSON.stringify(session),
      });
      setSyncMessage("Séance synchronisée via l’API");
    } catch (e) {
      setSyncMessage("Erreur synchronisation séance");
      console.error(e);
    }
  }

  function ensureSessionsForDate(date) {
    const createdSessions = [];

    setState((prev) => {
      const sessions = [...prev.sessions];

      ["midi", "soir", "matin"].forEach((slot) => {
        if (!sessions.some((s) => s.date === date && s.slot === slot)) {
          const session = {
            id: `${date}-${slot}`,
            date,
            slot,
            status: defaultSessionStatus(date, slot),
            encadrantId: null,
            referentId: null,
            participantIds: [],
          };
          sessions.push(session);
          createdSessions.push(session);
        }
      });

      return { ...prev, sessions };
    });

    if (USE_API) {
      createdSessions.forEach((session) => syncSessionToApi(session));
    }
  }

  function updateSession(sessionId, patch) {
    const currentSession =
      state.sessions.find((s) => s.id === sessionId) ||
      buildDefaultSession(sessionId);

    const updatedSession = { ...currentSession, ...patch };

    setState((prev) => {
      const exists = prev.sessions.some((s) => s.id === sessionId);
      return {
        ...prev,
        sessions: exists
          ? prev.sessions.map((s) => (s.id === sessionId ? updatedSession : s))
          : [...prev.sessions, updatedSession],
      };
    });

    syncSessionToApi(updatedSession);
  }

  function addParticipantToSession(sessionId, participantId) {
    const requestedId = String(participantId || "");
    if (!requestedId) return;

    const currentSession =
      state.sessions.find((s) => s.id === sessionId) ||
      buildDefaultSession(sessionId);

    const currentParticipantIds = currentSession.participantIds.map(String);
    const occupied =
      currentParticipantIds.length +
      (currentSession.encadrantId ? 1 : 0) +
      (currentSession.referentId ? 1 : 0);

    if (occupied >= MAX_PARTICIPANTS || currentParticipantIds.includes(requestedId)) return;

    const updatedSession = {
      ...currentSession,
      participantIds: [...currentParticipantIds, requestedId],
    };

    setState((prev) => {
      const exists = prev.sessions.some((s) => s.id === sessionId);
      return {
        ...prev,
        sessions: exists
          ? prev.sessions.map((s) => (s.id === sessionId ? updatedSession : s))
          : [...prev.sessions, updatedSession],
      };
    });

    syncSessionToApi(updatedSession);
  }

  function removeParticipantFromSession(sessionId, participantId) {
    const currentSession =
      state.sessions.find((s) => s.id === sessionId) ||
      buildDefaultSession(sessionId);

    const updatedSession = {
      ...currentSession,
      participantIds: currentSession.participantIds.filter((id) => id !== participantId),
    };

    setState((prev) => {
      const exists = prev.sessions.some((s) => s.id === sessionId);
      return {
        ...prev,
        sessions: exists
          ? prev.sessions.map((s) => (s.id === sessionId ? updatedSession : s))
          : [...prev.sessions, updatedSession],
      };
    });

    syncSessionToApi(updatedSession);
  }

  async function addParticipant() {
    if (!newParticipant.nom.trim() || !newParticipant.prenom.trim()) return;
    const participant = {
      ...newParticipant,
      nom: newParticipant.nom.trim(),
      prenom: newParticipant.prenom.trim(),
    };

    try {
      if (USE_API) {
        setIsSyncing(true);
        const created = await apiFetch("/participants", {
          method: "POST",
          body: JSON.stringify(participant),
        });
        setState((prev) => ({ ...prev, participants: [created, ...prev.participants] }));
        setRecentlyAddedParticipantIds((prev) => [
          String(created.id),
          ...prev.filter((id) => String(id) !== String(created.id)),
        ]);
        setSyncMessage("Participant ajouté via l’API");
      } else {
        const created = { ...participant, id: `p-${Date.now()}` };
        setState((prev) => ({
          ...prev,
          participants: [created, ...prev.participants],
        }));
        setRecentlyAddedParticipantIds((prev) => [
          String(created.id),
          ...prev.filter((id) => String(id) !== String(created.id)),
        ]);
      }
      setNewParticipant({
        nom: "", prenom: "", email: "", passport: "sans", cotisation: false, ffme: false, canEncadrer: false, canReferer: false, canAdmin: false,
      });
    } catch (e) {
      setSyncMessage(`Erreur ajout participant`);
      console.error(e);
    } finally {
      setIsSyncing(false);
    }
  }

  async function updateParticipant(id, patch) {
    const previous = state.participants;
    const next = previous.map((p) => (p.id === id ? { ...p, ...patch } : p));
    setState((prev) => ({ ...prev, participants: next }));

    if (!USE_API) return;
    try {
      const target = next.find((p) => p.id === id);
      const updated = await apiFetch(`/participants/${id}`, {
        method: "PUT",
        body: JSON.stringify(target),
      });
      setState((prev) => ({
        ...prev,
        participants: prev.participants.map((p) => (p.id === id ? updated : p)),
      }));
    } catch (e) {
      setState((prev) => ({ ...prev, participants: previous }));
      setSyncMessage("Erreur mise à jour participant");
      console.error(e);
    }
  }

  async function deleteParticipant(id) {
    const previousParticipants = state.participants;
    setState((prev) => ({
      ...prev,
      participants: prev.participants.filter((p) => p.id !== id),
      sessions: prev.sessions.map((s) => ({
        ...s,
        participantIds: s.participantIds.filter((pid) => pid !== id),
        encadrantId: s.encadrantId === id ? null : s.encadrantId,
        referentId: s.referentId === id ? null : s.referentId,
      })),
      realisations: prev.realisations.filter((r) => r.participantId !== id),
    }));
    setRecentlyAddedParticipantIds((prev) => prev.filter((pid) => String(pid) !== String(id)));

    if (!USE_API) return;
    try {
      await apiFetch(`/participants/${id}`, { method: "DELETE" });
      setSyncMessage("Participant supprimé via l’API");
    } catch (e) {
      setState((prev) => ({ ...prev, participants: previousParticipants }));
      setSyncMessage("Erreur suppression participant");
      console.error(e);
    }
  }

  async function addRoute() {
    const numeroVoieUnique = `voie-${Date.now()}`;
    const couleurPrises = newRoute.couleurPrises.trim();
    const nomOuvreur = newRoute.nomOuvreur.trim();
    if (!couleurPrises || !nomOuvreur) return setRouteError("Renseigne au moins la couleur et l’ouvreur.");

    const route = {
      id: `route-${Date.now()}`,
      numeroVoieUnique,
      numeroCorde: Number(newRoute.numeroCorde),
      couleurPrises,
      cotationReference: newRoute.cotationReference,
      cotationAjustee: newRoute.cotationReference,
      nomVoie: newRoute.nomVoie.trim(),
      nomOuvreur,
      moulinetteOnly: newRoute.moulinetteOnly,
      active: true,
      dateCreation: selectedDate,
    };

    try {
      const savedRoute = USE_API
        ? await apiFetch("/routes", { method: "POST", body: JSON.stringify(route) })
        : route;
      setState((prev) => ({ ...prev, routes: [...prev.routes, savedRoute] }));
      setRouteError("");
      setNewRoute({
        numeroCorde: "1", couleurPrises: "Blanc", cotationReference: "5c", nomVoie: "", nomOuvreur: "", moulinetteOnly: false,
      });
    } catch (error) {
      setRouteError(error.message || "Création de la voie impossible.");
    }
  }

  function startRouteEdition(route) {
    setEditingRouteId(route.id);
    setRouteEditDraft({
      numeroCorde: String(route.numeroCorde ?? 0),
      couleurPrises: route.couleurPrises || "Blanc",
      cotationReference: route.cotationReference || route.cotationAjustee || "5c",
      nomVoie: route.nomVoie || "",
      nomOuvreur: route.nomOuvreur || "",
      moulinetteOnly: Boolean(route.moulinetteOnly),
    });
    setRouteError("");
  }

  function cancelRouteEdition() {
    setEditingRouteId("");
    setRouteEditDraft(null);
  }

  async function saveRouteEdition(route) {
    if (!routeEditDraft) return;
    const couleurPrises = routeEditDraft.couleurPrises.trim();
    const nomOuvreur = routeEditDraft.nomOuvreur.trim();
    if (!couleurPrises || !nomOuvreur) {
      setRouteError("Renseigne au moins la couleur et l’ouvreur.");
      return;
    }

    const updatedRoute = {
      ...route,
      numeroCorde: Number(routeEditDraft.numeroCorde),
      couleurPrises,
      cotationReference: routeEditDraft.cotationReference,
      cotationAjustee: routeEditDraft.cotationReference,
      nomVoie: routeEditDraft.nomVoie.trim(),
      nomOuvreur,
      moulinetteOnly: routeEditDraft.moulinetteOnly,
    };

    try {
      const savedRoute = USE_API
        ? await apiFetch(`/routes/${encodeURIComponent(route.id)}`, {
            method: "PUT",
            body: JSON.stringify(updatedRoute),
          })
        : updatedRoute;
      setState((prev) => ({
        ...prev,
        routes: prev.routes.map((item) => (item.id === route.id ? savedRoute : item)),
      }));
      cancelRouteEdition();
      setSyncMessage("Voie mise à jour.");
    } catch (error) {
      setRouteError(error.message || "Modification de la voie impossible.");
    }
  }

  function getParticipantSessions(participantId) {
    if (!participantId) return [];

    return state.sessions
      .filter((session) => session.participantIds?.includes(participantId))
      .sort((a, b) => {
        const dateCompare = b.date.localeCompare(a.date);
        if (dateCompare !== 0) return dateCompare;
        return a.slot.localeCompare(b.slot);
      });
  }

  function resolveSessionIdForRealisation(participantId, selectedDay) {
    if (!participantId || !selectedDay) return "";

    const matchingSessions = state.sessions
      .filter((session) => session.date === selectedDay)
      .filter(isManagedSession)
      .filter((session) => session.participantIds?.includes(participantId))
      .sort((a, b) => a.slot.localeCompare(b.slot));

    return matchingSessions[0]?.id || "";
  }

  async function syncRealisationPatch(realisationId, patch) {
    try {
      await updateRealisationInApi(realisationId, patch);
    } catch (error) {
      console.error(error);
    }
  }

  function updateRealisation(realisationId, patch) {
    syncRealisationPatch(realisationId, patch);
    setState((prev) => ({
      ...prev,
      realisations: prev.realisations.map((realisation) => {
        if (realisation.id !== realisationId) return realisation;

        const next = { ...realisation, ...patch };

        // Si on change la séance, la date de réalisation suit la date de la séance.
        if (patch.sessionId) {
          const session = sessionsById[patch.sessionId];
          if (session) {
            next.dateRealisation = `${session.date}T12:00:00`;
          }
        }

        return next;
      }),
    }));
  }

  function openRealisationModal(routeId, requestedParticipantId = "") {
    const route = routesById[routeId];
    const requestedParticipant = participantsById[requestedParticipantId];
    const latestRegisteredDay = requestedParticipant?.cotisation
      ? getParticipantSessionDays(requestedParticipantId)[0] || ""
      : "";
    const defaultParticipantId = latestRegisteredDay ? requestedParticipantId : "";

    setNewRealisation((prev) => ({
      ...prev,
      participantId: defaultParticipantId,
      selectedDay: latestRegisteredDay,
      sessionId: defaultParticipantId && latestRegisteredDay
        ? resolveSessionIdForRealisation(defaultParticipantId, latestRegisteredDay) || ""
        : "",
      voieId: routeId,
      styleRealisation: route?.moulinetteOnly ? "moulinette" : (prev.styleRealisation || "a_vue"),
      cotationProposee: route?.cotationAjustee || route?.cotationReference || "",
      commentaire: "",
    }));

    setRealisationModalRouteId(routeId);
  }

  function closeRealisationModal() {
    setRealisationModalRouteId(null);
  }


async function persistRealisationToApi(realisation) {
  if (!USE_API) return realisation;
  if (!authToken) {
    throw new Error("Connexion requise pour enregistrer une réalisation.");
  }
  return await authApiFetch("/realisations", authToken, {
    method: "POST",
    body: JSON.stringify(realisation),
  });
}

async function updateRealisationInApi(realisationId, patch) {
  if (!USE_API || !authToken) return;
  await authApiFetch(`/realisations/${realisationId}`, authToken, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

async function deleteRealisation(realisation) {
  if (!realisation?.id) return;

  const route = routesById[realisation.voieId];
  const routeLabel = route ? formatRouteName(route) : "la voie concernée";
  const dateLabel = realisation.dateRealisation
    ? formatDateShortFr(realisation.dateRealisation.slice(0, 10))
    : "date inconnue";

  if (!window.confirm(`Supprimer définitivement la réalisation « ${routeLabel} » du ${dateLabel} ?`)) return;

  const previousRealisations = state.realisations;
  setState((prev) => ({
    ...prev,
    realisations: prev.realisations.filter((item) => item.id !== realisation.id),
  }));

  try {
    if (USE_API) {
      await authApiFetch(`/realisations/${encodeURIComponent(realisation.id)}`, authToken, {
        method: "DELETE",
      });
    }
  } catch (error) {
    setState((prev) => ({ ...prev, realisations: previousRealisations }));
    alert(`Suppression impossible : ${error.message || error}`);
  }
}

  async function addRealisation() {
    if (!newRealisation.participantId || !newRealisation.selectedDay || !newRealisation.voieId) {
      alert("Sélectionne au minimum un jour, un participant et une voie.");
      return;
    }

    const participant = participantsById[newRealisation.participantId];
    if (!participant?.cotisation) {
      alert("Le participant doit avoir payé sa cotisation pour enregistrer une réalisation.");
      return;
    }

    const sessionId = resolveSessionIdForRealisation(newRealisation.participantId, newRealisation.selectedDay);
    if (!sessionId) {
      alert("Le participant doit être inscrit à au moins une séance ce jour-là pour enregistrer une réalisation.");
      return;
    }

    const realisation = {
      id: `realisation-${Date.now()}`,
      participantId: newRealisation.participantId,
      sessionId,
      voieId: newRealisation.voieId,
      dateRealisation: `${newRealisation.selectedDay}T12:00:00`,
      styleRealisation: newRealisation.styleRealisation,
      commentaire: newRealisation.commentaire,
      cotationProposee: newRealisation.cotationProposee,
    };

    try {
      const savedRealisation = await persistRealisationToApi(realisation);
      setState((prev) => ({ ...prev, realisations: [...prev.realisations, savedRealisation || realisation] }));
      setNewRealisation((prev) => ({
        ...prev,
        participantId: "",
        selectedDay: "",
        sessionId: "",
        commentaire: "",
        cotationProposee: "",
      }));
      setRealisationModalRouteId(null);
    } catch (error) {
      alert(String(error.message || error));
    }
  }

  async function loadAdminAccessData() {
    if (!authToken || authUser?.role !== "admin") return;

    try {
      const [usersResponse, logsResponse] = await Promise.all([
        authApiFetch("/admin/auth/users", authToken),
        authApiFetch("/admin/auth/logs", authToken),
      ]);

      setAdminAuthUsers(usersResponse.users || []);
      setAdminAccessLogs((logsResponse.logs || []).filter((log) => log.event_type !== "theme_changed"));
    } catch (error) {
      console.error(error);
      setAuthError("Impossible de charger les accès et les logs.");
    }
  }

async function handleThemePreferenceChange(nextTheme) {
  const previousTheme = themePreference;
  setThemePreference(nextTheme);

  if (!USE_API || !authToken || !authUser) return;

  try {
    const data = await authApiFetch("/auth/theme", authToken, {
      method: "PUT",
      body: JSON.stringify({ theme_preference: nextTheme }),
    });
    if (data.user) {
      setAuthUser(data.user);
    }
    setAuthMessage("Préférence d’affichage mise à jour.");
    setAuthError("");
  } catch (error) {
    setThemePreference(previousTheme);
    setAuthError(String(error.message || error));
  }
}

  async function handleLogin() {
    try {
      setAuthError("");
      setAuthMessage("");

      const data = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify(loginForm),
      });

      setAuthToken("cookie");
      setAuthUser(data.user);
      if (data.user?.theme_preference) {
        setThemePreference(data.user.theme_preference);
      }
      if (data.user?.role === "admin") {
        setAdminUnlocked(true);
      }
      setAuthView("login");
      setGeneratedResetToken("");
      setAuthMessage("Connexion réussie.");
      await reloadApiState({ isMounted: () => true }).catch(() => {});
    } catch (error) {
      setAuthError(String(error.message || error));
    }
  }

  async function handleLogout() {
    try {
      await authApiFetch("/auth/logout", authToken, { method: "POST" });
    } catch (error) {
      console.error(error);
    } finally {
      setAuthToken("");
      setAuthUser(null);
      setAdminUnlocked(false);
      setGeneratedResetToken("");
      setAdminAuthUsers([]);
      setAdminAccessLogs([]);
    }
  }

  async function handleRequestAccess() {
    if (!requestAccessForm.prenom || !requestAccessForm.nom || !requestAccessForm.email) {
      return setAuthError("Renseigne prénom, nom et email.");
    }
    if (requestAccessForm.password !== requestAccessForm.confirmPassword) {
      return setAuthError("Les mots de passe ne correspondent pas.");
    }
    if (!isStrongPassword(requestAccessForm.password)) {
      return setAuthError(PASSWORD_RULE_TEXT);
    }
    if (!requestAccessForm.acceptTerms) {
      return setAuthError("Tu dois accepter les conditions d'utilisation.");
    }

    try {
      setAuthError("");
      const response = await apiFetch("/auth/request-access", {
        method: "POST",
        body: JSON.stringify({
          prenom: requestAccessForm.prenom,
          nom: requestAccessForm.nom,
          email: requestAccessForm.email,
          password: requestAccessForm.password,
          acceptTerms: requestAccessForm.acceptTerms,
        }),
      });

      setAuthMessage(response.message || "Demande d'accès transmise.");
      setRequestAccessForm({
        prenom: "",
        nom: "",
        email: "",
        password: "",
        confirmPassword: "",
        acceptTerms: false,
      });
      setAuthView("login");
    } catch (error) {
      setAuthError(String(error.message || error));
    }
  }

  async function handleForgotPassword() {
    if (!forgotPasswordForm.email) {
      return setAuthError("Renseigne ton email.");
    }

    try {
      setAuthError("");
      const response = await apiFetch("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: forgotPasswordForm.email }),
      });

      setAuthMessage(response.message || "La demande de réinitialisation a été enregistrée.");
      setAuthView("reset");
      setResetPasswordForm((prev) => ({ ...prev, email: forgotPasswordForm.email }));
    } catch (error) {
      setAuthError(String(error.message || error));
    }
  }

  async function handleResetPassword() {
    if (!resetPasswordForm.email || !resetPasswordForm.token) {
      return setAuthError("Renseigne email et code de réinitialisation.");
    }
    if (resetPasswordForm.password !== resetPasswordForm.confirmPassword) {
      return setAuthError("Les mots de passe ne correspondent pas.");
    }
    if (!isStrongPassword(resetPasswordForm.password)) {
      return setAuthError(PASSWORD_RULE_TEXT);
    }

    try {
      setAuthError("");
      const response = await apiFetch("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          email: resetPasswordForm.email,
          token: resetPasswordForm.token,
          password: resetPasswordForm.password,
        }),
      });

      setAuthMessage(response.message || "Mot de passe réinitialisé.");
      setResetPasswordForm({
        email: "",
        token: "",
        password: "",
        confirmPassword: "",
      });
      setAuthView("login");
    } catch (error) {
      setAuthError(String(error.message || error));
    }
  }

  async function approveAccessRequest(userId) {
    try {
      await authApiFetch(`/admin/auth/users/${userId}/approve`, authToken, { method: "POST" });
      await loadAdminAccessData();
    } catch (error) {
      setAuthError(String(error.message || error));
    }
  }

  async function revokeUserAccess(userId) {
    try {
      await authApiFetch(`/admin/auth/users/${userId}/revoke`, authToken, {
        method: "POST",
        body: JSON.stringify({ reason: "Révocation / répudiation par administrateur" }),
      });
      await loadAdminAccessData();
    } catch (error) {
      setAuthError(String(error.message || error));
    }
  }

  async function reactivateUserAccess(userId) {
    try {
      await authApiFetch(`/admin/auth/users/${userId}/reactivate`, authToken, { method: "POST" });
      await loadAdminAccessData();
    } catch (error) {
      setAuthError(String(error.message || error));
    }
  }

  async function generatePasswordResetToken(userId) {
    try {
      const response = await authApiFetch(`/admin/auth/users/${userId}/reset-token`, authToken, { method: "POST" });
      setGeneratedResetToken(`Code de réinitialisation temporaire : ${response.resetToken} (valable jusqu’à ${response.expiresAt})`);
      await loadAdminAccessData();
    } catch (error) {
      setAuthError(String(error.message || error));
    }
  }

  function unlockAdmin() {
    if (USE_API) {
      if (authUser?.role === "admin") {
        setAdminError("");
        setAdminUnlocked(true);
        return;
      }
      return setAdminError("Connexion administrateur requise.");
    }
    if (!ADMIN_CODE) return setAdminError("Code administrateur legacy non configuré.");
    if (!/^\d{8}$/.test(adminInput)) return setAdminError("Le code doit contenir 8 chiffres.");
    if (adminInput !== ADMIN_CODE) return setAdminError("Code invalide.");
    setAdminError("");
    setAdminUnlocked(true);
  }

  async function exportAllData() {
    if (USE_API && authToken) {
      try {
        const payload = await authApiFetch("/admin/export-data", authToken);
        downloadFile("climbcrew_export_api.json", JSON.stringify(payload.data || payload, null, 2));
        setImportMessage("Export API réussi.");
        return;
      } catch (error) {
        console.error(error);
        setImportMessage("Export API impossible : export local utilisé.");
      }
    }
    downloadFile("climbcrew_export.json", JSON.stringify(state, null, 2));
  }

  async function importJsonFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());

      if (USE_API && authToken) {
        const result = await authApiFetch("/admin/import-data", authToken, {
          method: "POST",
          body: JSON.stringify({ data: parsed }),
        });
        await reloadApiState();
        setImportMessage(
          `Import API réussi : ${result.participantsImported || 0} participants, ${result.sessionsImported || 0} séances, ${result.routesImported || 0} voies.`
        );
      } else {
        setState((prev) => normalizeAppData(parsed, prev));
        setImportMessage("Import JSON local réussi.");
      }
    } catch (error) {
      console.error(error);
      setImportMessage(`Import JSON impossible : ${error.message || error}`);
    }
    event.target.value = "";
  }

  function renderSessionCard(session, compact = false) {
    const inscrits = session.participantIds.map((id) => participantsById[id]).filter(Boolean);
    const occupied = inscrits.length + (session.encadrantId ? 1 : 0) + (session.referentId ? 1 : 0);
    const freeSessionPassports = new Set(["jaune", "orange", "vert", "bleu"]);
    const availableParticipants = state.participants.filter((p) =>
      !session.participantIds.includes(p.id)
      && (session.status !== "libre" || freeSessionPassports.has(normalizePassport(p.passport)))
    );

    return (
      <div className={`card session-card ${compact ? "session-card-compact" : ""}`} key={session.id}>
        <div className="card-header">
          <h3>Séance {session.slot}</h3>
          <span className="badge">{occupied}/{MAX_PARTICIPANTS}</span>
        </div>

        <div className="session-form-row">
          <div className="inline-field">
            <label>Statut</label>
            <select
              value={session.status}
              onChange={(e) => {
                const value = e.target.value;
                updateSession(session.id, {
                  status: value,
                  ...(value !== "encadree" ? { encadrantId: null } : {}),
                  ...(value !== "libre" ? { referentId: null } : {}),
                });
              }}
            >
              <option value="fermee">Fermée</option>
              <option value="libre">Libre</option>
              <option value="encadree">Encadrée</option>
              <option value="passeport">Passeport</option>
              <option value="challenge">Challenge</option>
              <option value="renouvellement">Renouvellement</option>
            </select>
          </div>

          {session.status === "encadree" && (
            <div className="inline-field">
              <label>Encadrant</label>
              <select
                value={session.encadrantId || ""}
                onChange={(e) => updateSession(session.id, { encadrantId: e.target.value || null })}
              >
                <option value="">Aucun</option>
                {alphabeticalParticipants.filter((p) => p.canEncadrer).map((p) => (
                  <option key={p.id} value={p.id}>{fullName(p)}</option>
                ))}
              </select>
            </div>
          )}

          {session.status === "libre" && (
            <div className="inline-field">
              <label>RÉFÉRENT</label>
              <select
                value={session.referentId || ""}
                onChange={(e) => updateSession(session.id, { referentId: e.target.value || null })}
              >
                <option value="">Aucun</option>
                {alphabeticalParticipants.filter((p) => p.canReferer).map((p) => (
                  <option key={p.id} value={p.id}>{fullName(p)}</option>
                ))}
              </select>
            </div>
          )}

          <div className="inline-field add-participant-field">
            <label>Inscription</label>
            <select
              defaultValue=""
              disabled={availableParticipants.length === 0 || occupied >= MAX_PARTICIPANTS}
              onChange={(event) => {
                const participantId = event.currentTarget.value;
                if (!participantId) return;
                addParticipantToSession(session.id, participantId);
                event.currentTarget.value = "";
              }}
            >
              <option value="">
                {availableParticipants.length === 0 ? "Aucune personne disponible" : "S'inscrire"}
              </option>
              {availableParticipants
                .sort((a, b) => fullName(a).localeCompare(fullName(b), "fr"))
                .map((p) => (
                  <option key={p.id} value={p.id}>{fullName(p)}</option>
                ))}
            </select>
          </div>
        </div>

        <div className="stack session-participant-list">
          {inscrits.length === 0 ? (
            <div className="muted-box">Aucun inscrit.</div>
          ) : (
            inscrits.map((p) => (
              <div
                className={`participant-row passport-row ${session.status === "libre" && normalizePassport(p.passport) === "sans" ? "passport-warning-hatched" : ""}`}
                key={p.id}
                style={getPassportStyle(p)}
                data-passport={normalizePassport(p.passport)}
              >
                <span className="participant-identity">
                  <span className="passport-dot" style={getPassportDotStyle(p)} aria-hidden="true" />
                  <span className="participant-name">{fullName(p)}</span>
                </span>
                <button className="remove-button" onClick={() => removeParticipantFromSession(session.id, p.id)} aria-label="Retirer">×</button>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }


  if (USE_API && authLoading) {
    return (
      <div className="auth-page">
        <style>{AUTH_LOGIN_INLINE_STYLE}</style>
        <div className="auth-card">
          <div className="brand auth-brand">
            <img src="/logo-climbcrew.png" alt="Logo ClimbClubCristal" className="app-logo" />
            <div>
              <h1>ClimbClubCristal</h1>
              <p className="small">Chargement de la session…</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (USE_API && !authUser) {
    return (
      <div className="auth-page">
        <style>{AUTH_LOGIN_INLINE_STYLE}</style>
        <div className="auth-card">
          <div className="brand auth-brand">
            <img src="/logo-climbcrew.png" alt="Logo ClimbClubCristal" className="app-logo" />
            <div>
              <h1>ClimbClubCristal</h1>
              <p className="small">Connexion requise pour accéder à l’application.</p>
            </div>
          </div>

          {authMessage && <div className="success" style={{ marginTop: 12 }}>{authMessage}</div>}
          {authError && <div className="error" style={{ marginTop: 12 }}>{authError}</div>}

          {authView === "login" && (
            <div className="grid two" style={{ marginTop: 14 }}>
              <div>
                <label>Email</label>
                <input value={loginForm.email} onChange={(e) => setLoginForm((p) => ({ ...p, email: e.target.value }))} />
              </div>
              <div>
                <label>Mot de passe</label>
                <input type="password" value={loginForm.password} onChange={(e) => setLoginForm((p) => ({ ...p, password: e.target.value }))} />
              </div>
              <div className="auth-submit-row">
                <button onClick={handleLogin}>Se connecter</button>
              </div>
            </div>
          )}

          {authView === "request" && (
            <div className="grid two" style={{ marginTop: 14 }}>
              <div>
                <label>Prénom</label>
                <input value={requestAccessForm.prenom} onChange={(e) => setRequestAccessForm((p) => ({ ...p, prenom: e.target.value }))} />
              </div>
              <div>
                <label>Nom</label>
                <input value={requestAccessForm.nom} onChange={(e) => setRequestAccessForm((p) => ({ ...p, nom: e.target.value }))} />
              </div>
              <div>
                <label>Email</label>
                <input value={requestAccessForm.email} onChange={(e) => setRequestAccessForm((p) => ({ ...p, email: e.target.value }))} />
              </div>
              <div>
                <label>Mot de passe fort</label>
                <input type="password" value={requestAccessForm.password} onChange={(e) => setRequestAccessForm((p) => ({ ...p, password: e.target.value }))} />
              </div>
              <div>
                <label>Confirmation</label>
                <input type="password" value={requestAccessForm.confirmPassword} onChange={(e) => setRequestAccessForm((p) => ({ ...p, confirmPassword: e.target.value }))} />
              </div>
              <div>
                <label>Politique mot de passe</label>
                <input value={PASSWORD_RULE_TEXT} readOnly />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label><input type="checkbox" checked={requestAccessForm.acceptTerms} onChange={(e) => setRequestAccessForm((p) => ({ ...p, acceptTerms: e.target.checked }))} /> J’accepte les conditions d’utilisation et la journalisation des accès.</label>
              </div>
              <div className="auth-submit-row">
                <button onClick={handleRequestAccess}>Envoyer la demande</button>
              </div>
            </div>
          )}

          {authView === "forgot" && (
            <div className="grid two" style={{ marginTop: 14 }}>
              <div>
                <label>Email</label>
                <input value={forgotPasswordForm.email} onChange={(e) => setForgotPasswordForm({ email: e.target.value })} />
              </div>
              <div className="small" style={{ display: "flex", alignItems: "end" }}>
                La demande sera journalisée. Un administrateur pourra générer un code de réinitialisation.
              </div>
              <div className="auth-submit-row">
                <button onClick={handleForgotPassword}>Signaler la perte du mot de passe</button>
              </div>
            </div>
          )}

          {authView === "reset" && (
            <div className="grid two" style={{ marginTop: 14 }}>
              <div>
                <label>Email</label>
                <input value={resetPasswordForm.email} onChange={(e) => setResetPasswordForm((p) => ({ ...p, email: e.target.value }))} />
              </div>
              <div>
                <label>Code de réinitialisation</label>
                <input value={resetPasswordForm.token} onChange={(e) => setResetPasswordForm((p) => ({ ...p, token: e.target.value }))} />
              </div>
              <div>
                <label>Nouveau mot de passe</label>
                <input type="password" value={resetPasswordForm.password} onChange={(e) => setResetPasswordForm((p) => ({ ...p, password: e.target.value }))} />
              </div>
              <div>
                <label>Confirmation</label>
                <input type="password" value={resetPasswordForm.confirmPassword} onChange={(e) => setResetPasswordForm((p) => ({ ...p, confirmPassword: e.target.value }))} />
              </div>
              <div>
                <label>Politique mot de passe</label>
                <input value={PASSWORD_RULE_TEXT} readOnly />
              </div>
              <div className="auth-submit-row">
                <button onClick={handleResetPassword}>Mettre à jour le mot de passe</button>
              </div>
            </div>
          )}

          <div className="group auth-switcher" style={{ marginTop: 14 }}>
            <button className={authView === "request" ? "" : "secondary"} onClick={() => { setAuthView("request"); setAuthError(""); setAuthMessage(""); }}>Demander un accès</button>
            <button className={authView === "forgot" ? "" : "secondary"} onClick={() => { setAuthView("forgot"); setAuthError(""); setAuthMessage(""); }}>Mot de passe perdu</button>
          </div>

          <div className="small" style={{ marginTop: 10, textAlign: "center", color: "#475569" }}>
            Version : {APP_VERSION}
          </div>
        </div>
      </div>
    );
  }


  return (
    <div className="app">
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; font-family: Inter, Arial, sans-serif; background: #0f172a; color: #e2e8f0; }
        .app { min-height: 100vh; padding: 20px; background: linear-gradient(135deg,#020617,#0f172a,#1e293b); }
        .shell { max-width: 1400px; margin: 0 auto; }
        .topbar { display: flex; align-items: center; justify-content: flex-start; gap: 16px; }
        .brand { display: flex; align-items: center; gap: 14px; min-width: 0; }
        .app-logo { width: 48px; height: 48px; object-fit: contain; border-radius: 14px; background: #fff; padding: 4px; box-shadow: 0 8px 22px rgba(0,0,0,.18); }
        .menu-button { background: #020617; color: #e2e8f0; border: 1px solid rgba(148,163,184,.45); min-width: 48px; padding: 10px 12px; }
        .sidebar-backdrop { position: fixed; inset: 0; background: rgba(2,6,23,.62); z-index: 40; }
        .sidebar { position: fixed; top: 0; left: 0; bottom: 0; width: min(310px, 86vw); height: 100vh; height: 100dvh; z-index: 50; transform: translateX(-110%); transition: transform .22s ease; background: rgba(15,23,42,.98); border-right: 1px solid rgba(148,163,184,.25); padding: 18px; padding-bottom: calc(18px + env(safe-area-inset-bottom)); box-shadow: 20px 0 60px rgba(0,0,0,.4); display: flex; flex-direction: column; gap: 14px; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
        .sidebar.open { transform: translateX(0); }
        .sidebar-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
        .sidebar-brand { display: flex; align-items: center; gap: 10px; font-weight: 900; color: #e2e8f0; }
        .sidebar-logo { width: 44px; height: 44px; object-fit: contain; background: #fff; border-radius: 12px; padding: 4px; }
        .sidebar-close { background: #020617; color: #e2e8f0; border: 1px solid rgba(148,163,184,.4); }
        .sidebar-logout { display: inline-flex; align-items: center; justify-content: center; gap: 5px; width: auto !important; min-width: 0; padding: 6px 8px; font-size: 12px; white-space: nowrap; }
        .sidebar-logout-icon { width: 16px; height: 16px; flex: 0 0 16px; }
        .side-tab { text-align: left; width: 100%; background: #1e293b; color: #cbd5e1; border: 1px solid rgba(148,163,184,.18); }
        .side-tab.active { background: #22d3ee; color: #082f49; }
        .sidebar-account { margin-top: 4px; padding-top: 10px; border-top: 1px solid rgba(148,163,184,.2); display: grid; gap: 8px; }
        .sidebar-account .secondary { width: 100%; }
        .date-nav { display: grid; grid-template-columns: 48px minmax(180px, 220px) 48px; flex: 1 1 440px; align-items: center; justify-content: center; flex-wrap: nowrap; }
        .date-input { width: 100%; max-width: 220px; min-width: 0; text-align: center; font-weight: 800; text-transform: capitalize; }
        .date-display { cursor: default; }
        .nav-symbol { min-width: 48px; padding: 10px 12px; font-size: 20px; line-height: 1; }
        .session-form-row { display: grid; grid-template-columns: minmax(180px,.7fr) minmax(220px,1fr) minmax(280px,1.4fr); gap: 12px; align-items: end; margin-bottom: 14px; }
        .inline-field { display: grid; grid-template-columns: auto minmax(160px, 1fr); gap: 10px; align-items: center; }
        .inline-field label { margin-bottom: 0; white-space: nowrap; }
        .add-participant-field { grid-column: span 1; }
        .passport-row { color: inherit; background: transparent; }
        .participant-identity { display: inline-flex; align-items: center; gap: 7px; min-width: 0; }
        .passport-dot { width: 14px; height: 14px; flex: 0 0 14px; border-radius: 999px; border: 1px solid rgba(255,255,255,.72); box-shadow: 0 0 0 1px rgba(15,23,42,.35); }
        .participant-name { font-weight: 800; }
        .remove-button { display: inline-flex; align-items: center; justify-content: center; width: 26px; min-width: 26px; height: 26px; min-height: 26px; background: rgba(148,163,184,.28); color: inherit; border: 1px solid rgba(148,163,184,.45); border-radius: 999px; padding: 0; font-size: 20px; line-height: 1; box-shadow: none; }
        .remove-button:hover { background: rgba(148,163,184,.45); color: inherit; }
        .hero { background: rgba(15,23,42,.88); border: 1px solid rgba(148,163,184,.25); border-radius: 18px; padding: 10px; box-shadow: 0 14px 36px rgba(0,0,0,.25); }
        .hero h1 { margin: 0; font-size: 24px; line-height: 1.05; }
        .hero p { margin: 8px 0 0; color: #94a3b8; }
        .tabs { display: grid; grid-template-columns: repeat(7, minmax(0,1fr)); gap: 8px; margin-top: 20px; }
        .tab { border: 0; border-radius: 14px; padding: 12px 10px; background: #1e293b; color: #cbd5e1; font-weight: 700; cursor: pointer; }
        .tab.active { background: #22d3ee; color: #082f49; }
        .toolbar, .card { background: rgba(15,23,42,.88); border: 1px solid rgba(148,163,184,.25); border-radius: 20px; padding: 18px; margin-top: 18px; }
        .toolbar-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; }
        .group { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
        button, select, input { font: inherit; }
        button { cursor: pointer; border: 0; border-radius: 12px; padding: 10px 14px; font-weight: 700; background: #22d3ee; color: #082f49; }
        button.secondary { background: #334155; color: #e2e8f0; }
        button.ghost { background: transparent; color: #e2e8f0; border: 1px solid rgba(148,163,184,.35); }
        button.danger { background: #ef4444; color: white; }
        input, select { width: 100%; border-radius: 12px; border: 1px solid rgba(148,163,184,.35); background: #0f172a; color: #e2e8f0; padding: 10px 12px; }
        label { display: block; font-size: 12px; font-weight: 700; color: #94a3b8; margin-bottom: 6px; text-transform: uppercase; letter-spacing: .04em; }
        .grid { display: grid; gap: 14px; }
        .grid.two { grid-template-columns: repeat(2,minmax(0,1fr)); }
        .grid.three { grid-template-columns: repeat(3,minmax(0,1fr)); }
        .grid.four { grid-template-columns: repeat(4,minmax(0,1fr)); }
        .grid.five { grid-template-columns: repeat(5,minmax(0,1fr)); }
        .stack { display: grid; gap: 10px; }
        .card-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 14px; }
        .card-header h3, .card-header h2 { margin: 0; }
        .badge { display: inline-flex; align-items: center; justify-content: center; min-width: 64px; padding: 6px 10px; border-radius: 999px; border: 1px solid rgba(148,163,184,.35); color: #cbd5e1; }
        .subcard { padding: 12px; border: 1px solid rgba(148,163,184,.25); border-radius: 14px; background: rgba(2,6,23,.45); }
        .muted-box { padding: 14px; border: 1px dashed rgba(148,163,184,.35); border-radius: 14px; color: #94a3b8; }
        .participant-row { display: flex; justify-content: space-between; gap: 10px; align-items: center; padding: 10px 12px; background: rgba(30,41,59,.9); border-radius: 12px; }
        .stats-grid { display: grid; grid-template-columns: repeat(5,minmax(0,1fr)); gap: 12px; }
        .stat { background: rgba(15,23,42,.88); border: 1px solid rgba(148,163,184,.25); border-radius: 18px; padding: 16px; }
        .stat .label { font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: .04em; }
        .stat .value { margin-top: 10px; font-size: 30px; font-weight: 800; }
        .route-card { color: #111827; border: 1px solid rgba(0,0,0,.1); border-radius: 14px; padding: 12px; }
        .route-card strong,
        .passport-row .participant-name { color: inherit !important; }
        .small { font-size: 12px; color: #94a3b8; }
        .success { color: #86efac; }
        .error { color: #fca5a5; }
        .pill { padding: 4px 8px; border-radius: 999px; background: rgba(255,255,255,.35); font-size: 12px; display: inline-flex; align-items: center; }
        .faq-item { padding: 12px 0; border-bottom: 1px solid rgba(148,163,184,.2); }
        .faq-item summary { display: flex; align-items: center; justify-content: space-between; gap: 10px; cursor: pointer; list-style: none; }
        .faq-item summary::-webkit-details-marker { display: none; }
        .faq-item summary::after { content: "›"; flex: 0 0 auto; font-size: 22px; line-height: 1; transition: transform .18s ease; }
        .faq-item[open] summary::after { transform: rotate(90deg); }
        .faq-item > .small { margin-top: 7px !important; }
        .week-grid { display: grid; grid-template-columns: repeat(5, minmax(240px, 1fr)); gap: 12px; align-items: start; overflow-x: auto; padding-bottom: 8px; }
        .week-day-card { min-width: 0; padding: 12px; border-radius: 18px; background: var(--theme-card-soft); border: 1px solid var(--theme-card-border); }
        .week-day-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
        .week-day-header h3 { margin: 0; font-size: 16px; }
        .week-day-open { padding: 7px 9px; font-size: 12px; white-space: nowrap; }
        .week-day-sessions { display: grid; gap: 10px; }
        .session-card-compact { margin-top: 0; padding: 10px; border-radius: 15px; }
        .session-card-compact .session-form-row { grid-template-columns: 1fr; gap: 7px; margin-bottom: 9px; }
        .session-card-compact .inline-field { grid-template-columns: 1fr; gap: 5px; }
        .session-card-compact .inline-field label { font-size: 10px; }
        .session-card-compact .card-header h3 { font-size: 15px; text-transform: capitalize; }
        .session-card-compact .session-participant-list { gap: 6px; }
        .sidebar-theme { margin-top: 4px; padding-top: 12px; border-top: 1px solid var(--theme-card-border); }
        .sidebar-theme label { margin-bottom: 6px; }
        @media (min-width: 701px) and (max-width: 1199px) {
          .week-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); overflow-x: visible; }
        }
        @media (max-width: 1100px) {
          .tabs { grid-template-columns: repeat(3,minmax(0,1fr)); }
          .stats-grid, .grid.five, .grid.four, .grid.three, .grid.two { grid-template-columns: 1fr; }
          .topbar { align-items: flex-start; }
          .app-logo { width: 44px; height: 44px; }
          .date-nav { width: 100%; }
          .date-input { flex: 1 1 auto; max-width: none; }
          .session-form-row { grid-template-columns: 1fr; }
          .inline-field { grid-template-columns: 1fr; }
        }

        .mobile-bottom-nav { display: none; }
        .bottom-tab { flex: 0 0 auto; min-width: 96px; min-height: 48px; padding: 8px 10px; border-radius: 14px; background: rgba(15,23,42,.96); color: #cbd5e1; border: 1px solid rgba(148,163,184,.24); box-shadow: 0 10px 30px rgba(0,0,0,.28); }
        .bottom-tab.active { background: #22d3ee; color: #082f49; }

        @media (max-width: 700px) {
          body { overflow-x: hidden; }
          .app { padding: 8px 8px 86px; }
          .shell { width: 100%; max-width: 100%; }

          /* Header compact : plus de hauteur utile en salle et sur smartphone. */
          .hero { position: sticky; top: 0; z-index: 30; padding: 7px 9px; border-radius: 14px; backdrop-filter: blur(10px); }
          .topbar { gap: 10px; align-items: center; }
          .brand { gap: 10px; }
          .app-logo { width: 34px; height: 34px; border-radius: 9px; padding: 3px; }
          .hero h1 { font-size: 20px; line-height: 1; }
          .hero .small { font-size: 11px; margin-top: 4px; }
          .menu-button { min-width: 42px; min-height: 42px; padding: 8px; border-radius: 12px; }

          /* Navigation mobile au pouce. Le menu latéral reste disponible via le bouton à gauche. */
          .mobile-bottom-nav {
            position: fixed;
            left: 8px;
            right: 8px;
            bottom: 8px;
            z-index: 70;
            display: flex;
            gap: 8px;
            overflow-x: auto;
            padding: 8px;
            border-radius: 18px;
            background: rgba(2,6,23,.92);
            border: 1px solid rgba(148,163,184,.25);
            box-shadow: 0 18px 50px rgba(0,0,0,.45);
            -webkit-overflow-scrolling: touch;
          }
          .mobile-bottom-nav::-webkit-scrollbar { display: none; }
          .bottom-tab { min-width: 92px; min-height: 44px; padding: 8px; font-size: 12px; white-space: nowrap; }

          /* Cartes compactes. */
          .toolbar, .card { margin-top: 10px; padding: 12px; border-radius: 16px; }
          .toolbar-row { gap: 8px; }
          .card-header { gap: 8px; margin-bottom: 10px; flex-wrap: wrap; align-items: flex-start; }
          .card-header h2 { font-size: 18px; }
          .card-header h3 { font-size: 17px; }
          .badge { min-width: 50px; padding: 5px 8px; font-size: 12px; }

          /* Date et actions principales faciles à toucher. */
          .date-nav { width: 100%; flex: 1 1 100%; gap: 8px; justify-content: space-between; }
          .date-input { flex: 1 1 auto; max-width: none; min-width: 0; min-height: 42px; padding: 8px 10px; font-size: 15px; }
          .nav-symbol { min-width: 42px; min-height: 42px; padding: 8px 10px; font-size: 18px; }
          button, input, select { min-height: 44px; }
          .group button { padding: 8px 10px; }

          /* Séances : champs et inscrits en version compacte. */
          .session-card { padding: 12px; }
          .session-form-row { grid-template-columns: 1fr; gap: 8px; margin-bottom: 10px; }
          .inline-field { grid-template-columns: 92px minmax(0, 1fr); gap: 8px; }
          .inline-field label { font-size: 11px; }
          .session-participant-list {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
          }
          .session-participant-list .muted-box { width: 100%; }
          .session-participant-list .participant-row {
            width: auto;
            flex: 0 1 auto;
            min-height: 36px;
            padding: 5px 6px 5px 10px;
            border-radius: 999px;
            gap: 8px;
          }
          .participant-name { font-size: 13px; white-space: nowrap; }
          .remove-button {
            min-width: 32px;
            width: 32px;
            min-height: 32px;
            height: 32px;
            padding: 0;
            border-radius: 999px;
            font-size: 20px;
            line-height: 1;
          }

          /* Statistiques : cartes lisibles au lieu d'une grille trop large. */
          .stats-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
          .stat { padding: 12px; border-radius: 14px; }
          .stat .value { font-size: 24px; margin-top: 6px; }
          .participant-row { padding: 8px 10px; font-size: 14px; }

          /* Contraste renforcé pour les statistiques affichées sur fond sombre. */
          .lead-grade-row,
          .lead-grade-row strong,
          .lead-grade-row .small {
            color: #ffffff !important;
            opacity: 1 !important;
            font-weight: 700;
            text-shadow: 0 1px 1px rgba(0, 0, 0, .35);
          }

          /* Liste statistique : le nom et les détails occupent des lignes
             distinctes afin d'éviter tout chevauchement sur écran étroit. */
          .stats-participant-row {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) !important;
            align-items: start !important;
            justify-content: stretch !important;
            gap: 4px !important;
            min-height: 0 !important;
            height: auto !important;
            padding: 7px 10px !important;
            border-radius: 18px !important;
          }
          .stats-participant-row .participant-identity {
            width: 100% !important;
            min-width: 0 !important;
          }
          .stats-participant-row .participant-name {
            white-space: normal !important;
            overflow-wrap: anywhere;
            font-size: 14px !important;
            line-height: 1.2 !important;
          }
          .stats-participant-row > .small {
            display: block !important;
            width: 100% !important;
            min-width: 0 !important;
            white-space: normal !important;
            overflow-wrap: anywhere;
            font-size: 12px !important;
            line-height: 1.3 !important;
          }

          /* Le drawer devient plein écran et compact sur mobile.
             Il reste défilable pour que tous les onglets, l'ambiance et le compte
             soient accessibles quelle que soit la hauteur de l'écran. */
          .sidebar {
            width: 100vw;
            max-width: none;
            height: 100vh;
            height: 100dvh;
            padding: 10px 12px;
            padding-bottom: calc(12px + env(safe-area-inset-bottom));
            gap: 6px;
            overflow-y: auto;
          }
          .sidebar-header {
            flex: 0 0 auto;
            min-height: 44px;
            margin-bottom: 2px;
          }
          .sidebar-logo { width: 36px; height: 36px; }
          .app .sidebar .side-tab {
            flex: 0 0 auto;
            min-height: 40px;
            padding: 6px 10px !important;
            font-size: 14px;
            line-height: 1.1;
          }
          .sidebar-theme {
            flex: 0 0 auto;
            margin-top: 2px;
            padding-top: 7px;
          }
          .sidebar-account { flex: 0 0 auto; }

          .grid.five, .grid.four, .grid.three, .grid.two { grid-template-columns: 1fr; }
          .week-grid { display: flex; gap: 10px; overflow-x: auto; scroll-snap-type: x mandatory; margin: 0 -8px; padding: 0 8px 10px; -webkit-overflow-scrolling: touch; }
          .week-day-card { flex: 0 0 min(92vw, 430px); scroll-snap-align: start; }
          .week-day-header { position: sticky; top: 64px; z-index: 2; padding: 4px 0; background: var(--theme-card-soft); }
          .theme-selector-inline { display: none; }
        }

        @media (max-width: 420px) {
          .stats-grid { grid-template-columns: 1fr; }
          .bottom-tab { min-width: 84px; font-size: 11px; }
          .hero h1 { font-size: 18px; }
          .app-logo { width: 32px; height: 32px; }
          .inline-field { grid-template-columns: 1fr; }
        }


        /* Priorité A mobile : date en une ligne, champs plus compacts, segment Jour/Semaine. */
        .view-toggle { flex: 0 0 auto; }

        @media (max-width: 700px) {
          .toolbar-row {
            display: grid;
            grid-template-columns: 1fr;
            gap: 8px;
          }

          .date-nav {
            display: grid;
            grid-template-columns: 44px minmax(0, 1fr) 44px;
            width: 100%;
            flex: 1 1 100%;
            gap: 8px;
            align-items: center;
            justify-content: stretch;
            flex-wrap: nowrap;
          }

          .date-input {
            max-width: none;
            width: 100%;
            min-width: 0;
            height: 42px;
            min-height: 42px;
            padding: 7px 8px;
            font-size: 15px;
            text-transform: none;
          }

          .nav-symbol {
            width: 44px;
            min-width: 44px;
            height: 42px;
            min-height: 42px;
            padding: 0;
            font-size: 18px;
          }

          .view-toggle {
            display: grid;
            grid-template-columns: 1fr 1fr;
            width: 100%;
            gap: 6px;
            padding: 4px;
            border-radius: 14px;
            background: rgba(2, 6, 23, .35);
            border: 1px solid rgba(148, 163, 184, .18);
          }

          .view-toggle button {
            min-height: 38px;
            padding: 6px 8px;
            border-radius: 11px;
            font-size: 14px;
          }

          .session-form-row {
            grid-template-columns: 1fr;
            gap: 6px;
            margin-bottom: 8px;
          }

          .inline-field {
            grid-template-columns: 74px minmax(0, 1fr);
            gap: 7px;
          }

          .inline-field label {
            font-size: 10px;
            letter-spacing: .03em;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .inline-field select,
          .inline-field input {
            min-height: 40px;
            padding: 7px 10px;
            border-radius: 12px;
          }

          button, input, select {
            min-height: 40px;
          }

          .session-card {
            padding: 10px 12px;
          }
        }


        .modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
          background: rgba(2, 6, 23, .72);
          backdrop-filter: blur(8px);
        }

        .modal-panel {
          width: min(920px, 100%);
          max-height: calc(100vh - 36px);
          overflow: auto;
          padding: 18px;
          border-radius: 22px;
          background: #0f172a;
          border: 1px solid rgba(148, 163, 184, .28);
          box-shadow: 0 28px 80px rgba(0,0,0,.55);
        }

        .modal-title {
          margin: 0;
        }

        .modal-close {
          min-width: 42px;
          height: 42px;
          border-radius: 999px;
        }

        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 16px;
        }

        @media (max-width: 700px) {
          .modal-overlay {
            align-items: flex-end;
            padding: 8px;
          }

          .modal-panel {
            max-height: calc(100vh - 16px);
            border-radius: 20px;
            padding: 14px;
          }

          .modal-actions {
            display: grid;
            grid-template-columns: 1fr 1fr;
          }
        }


        .editable-realisation-card {
          border: 1px solid rgba(148, 163, 184, .25);
          background: rgba(2, 6, 23, .35);
        }

        @media (max-width: 700px) {
          .editable-realisation-card .grid.three {
            grid-template-columns: 1fr;
          }
        }


        .timeline-realisation-card {
          border: 1px solid rgba(148, 163, 184, .25);
          background: rgba(2, 6, 23, .35);
        }

        .timeline-realisation-summary {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .timeline-details-panel {
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid rgba(148, 163, 184, .24);
        }

        @media (max-width: 700px) {
          .timeline-realisation-summary {
            align-items: flex-start;
            flex-direction: column;
          }

          .timeline-realisation-summary button {
            width: 100%;
          }

          .timeline-details-panel .grid.three {
            grid-template-columns: 1fr;
          }
        }


        .auth-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: linear-gradient(180deg, #020617 0%, #0f172a 100%);
        }

        .auth-card {
          width: min(880px, 100%);
          padding: 22px;
          border-radius: 24px;
          background: rgba(15, 23, 42, .96);
          border: 1px solid rgba(148, 163, 184, .2);
          box-shadow: 0 24px 80px rgba(0,0,0,.45);
        }

        .auth-brand {
          align-items: center;
          justify-content: flex-start;
        }

        .auth-switcher {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .topbar-user {
          margin-left: auto;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .badge.danger {
          background: rgba(239,68,68,.18);
          color: #fecaca;
          border-color: rgba(239,68,68,.35);
        }

        @media (max-width: 700px) {
          .auth-card {
            padding: 16px;
            border-radius: 18px;
          }

          .topbar-user {
            width: 100%;
            justify-content: space-between;
            margin-left: 0;
            margin-top: 8px;
          }

          .auth-switcher {
            display: grid;
            grid-template-columns: 1fr 1fr;
          }
        }

:root {
  --theme-page-bg: #0f172a;
  --theme-app-bg: linear-gradient(135deg,#020617,#0f172a,#1e293b);
  --theme-card-bg: rgba(15, 23, 42, .92);
  --theme-card-soft: rgba(2, 6, 23, .42);
  --theme-card-border: rgba(148,163,184,.22);
  --theme-text: #e2e8f0;
  --theme-text-muted: #cbd5e1;
  --theme-input-bg: rgba(2, 6, 23, .55);
  --theme-input-border: rgba(148,163,184,.32);
  --theme-sidebar-bg: rgba(2,6,23,.95);
  --theme-accent: #22d3ee;
  --theme-accent-text: #082f49;
  --theme-stat-bg: rgba(2,6,23,.48);
}

:root[data-theme="light"] {
  --theme-page-bg: #f4f7fb;
  --theme-app-bg: linear-gradient(180deg,#f8fbff,#eef2f7);
  --theme-card-bg: rgba(255,255,255,.94);
  --theme-card-soft: rgba(248,250,252,.98);
  --theme-card-border: rgba(148,163,184,.20);
  --theme-text: #0f172a;
  --theme-text-muted: #475569;
  --theme-input-bg: #ffffff;
  --theme-input-border: rgba(148,163,184,.28);
  --theme-sidebar-bg: rgba(255,255,255,.98);
  --theme-accent: #0b4a9d;
  --theme-accent-text: #ffffff;
  --theme-stat-bg: rgba(248,250,252,.95);
}

:root[data-theme="fun"] {
  --theme-page-bg: #fff7ed;
  --theme-app-bg: linear-gradient(135deg,#fff7ed,#fef3c7,#fce7f3);
  --theme-card-bg: rgba(255,255,255,.94);
  --theme-card-soft: rgba(255,247,237,.96);
  --theme-card-border: rgba(249,115,22,.28);
  --theme-text: #292524;
  --theme-text-muted: #7c2d12;
  --theme-input-bg: #ffffff;
  --theme-input-border: rgba(249,115,22,.35);
  --theme-sidebar-bg: rgba(255,247,237,.98);
  --theme-accent: #f97316;
  --theme-accent-text: #ffffff;
  --theme-stat-bg: rgba(254,243,199,.78);
}

body {
  background: var(--theme-page-bg) !important;
  color: var(--theme-text);
  transition: background .25s ease, color .25s ease;
}

.app {
  background: var(--theme-app-bg) !important;
  color: var(--theme-text) !important;
}

.toolbar,
.card,
.subcard,
.muted-box,
.stat,
.modal-panel,
.auth-card,
.auth-shell,
.sidebar,
.mobile-bottom-nav {
  background: var(--theme-card-bg) !important;
  border-color: var(--theme-card-border) !important;
  color: var(--theme-text) !important;
}

.subcard,
.muted-box,
.stat {
  background: var(--theme-card-soft) !important;
}

.sidebar {
  background: var(--theme-sidebar-bg) !important;
}

input,
select,
textarea {
  background: var(--theme-input-bg) !important;
  color: var(--theme-text) !important;
  border-color: var(--theme-input-border) !important;
}

.small,
.label,
.auth-subtitle,
.auth-helper-text {
  color: var(--theme-text-muted) !important;
}

h1, h2, h3, strong, label {
  color: var(--theme-text) !important;
}

.menu-button,
.secondary,
.sidebar-close,
.side-tab,
.bottom-tab {
  border-color: var(--theme-card-border) !important;
}

.theme-selector-inline {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 6px;
}

.theme-selector-inline select {
  min-width: 130px;
}

button:not(.danger):not(.secondary):not(.ghost),
.side-tab.active,
.bottom-tab.active {
  background: var(--theme-accent) !important;
  color: var(--theme-accent-text) !important;
}

:root[data-theme="fun"] .hero,
:root[data-theme="fun"] .toolbar,
:root[data-theme="fun"] .card,
:root[data-theme="fun"] .week-day-card {
  box-shadow: 0 16px 40px rgba(249,115,22,.12);
}

:root[data-theme="light"] .app-logo,
:root[data-theme="light"] .sidebar-logo,
:root[data-theme="fun"] .app-logo,
:root[data-theme="fun"] .sidebar-logo {
  background: #ffffff;
  box-shadow: 0 8px 24px rgba(15,23,42,.08);
}

@media (max-width: 700px) {
  .theme-selector-inline {
    width: 100%;
    justify-content: space-between;
  }

  .theme-selector-inline select {
    min-width: 0;
    width: 150px;
  }
}

      `}</style>

      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`} aria-label="Navigation ClimbClubCristal">
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <img src="/logo-climbcrew.png" alt="Logo ClimbClubCristal" className="sidebar-logo" />
            <span>ClimbClubCristal</span>
          </div>
          <button
            className="sidebar-close sidebar-logout"
            onClick={() => {
              setSidebarOpen(false);
              handleLogout();
            }}
            aria-label="Se déconnecter"
            title="Déconnexion"
          >
            <svg className="sidebar-logout-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        {visibleTabs.map((item) => (
          <button
            key={item.key}
            className={`side-tab ${tab === item.key ? "active" : ""}`}
            onClick={() => {
              setTab(item.key);
              setSidebarOpen(false);
            }}
          >
            {item.label}
          </button>
        ))}
        <div className="sidebar-theme">
          <label htmlFor="sidebar-theme-selector">Ambiance</label>
          <select
            id="sidebar-theme-selector"
            value={themePreference}
            onChange={(event) => handleThemePreferenceChange(event.target.value)}
          >
            {THEME_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        {authUser && (
          <div className="sidebar-account">
            <div className="small">{authUser.email}</div>
          </div>
        )}
      </aside>

      {realisationModalRoute && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Enregistrer une voie réalisée">
          <div className="modal-panel">
            <div className="card-header">
              <div>
                <h2 className="modal-title">Enregistrer une voie réalisée</h2>
                <div className="small">
                  {formatRouteName(realisationModalRoute)} · Corde {realisationModalRoute.numeroCorde} · {realisationModalRoute.cotationAjustee}
                </div>
              </div>
              <button className="danger ghost modal-close" onClick={closeRealisationModal} aria-label="Fermer">×</button>
            </div>

            <div className="grid three">
              <div>
                <label>Jour</label>
                <select
                  value={newRealisation.selectedDay}
                  onChange={(e) => {
                    const selectedDay = e.target.value;
                    setNewRealisation((prev) => ({
                      ...prev,
                      selectedDay,
                      sessionId: "",
                    }));
                  }}
                >
                  <option value="">Choisir un jour</option>
                  {modalAvailableDays.length === 0 ? (
                    <option value="" disabled>Aucun jour disponible</option>
                  ) : (
                    modalAvailableDays.map((day) => <option key={day} value={day}>{formatDateShortFr(day)}</option>)
                  )}
                </select>
                <div className="small" style={{ marginTop: 6, color: "inherit" }}>
                  Aucun jour n’est prérempli. Si un participant est sélectionné, seuls ses jours d’inscription sont proposés.
                </div>
              </div>

              <div>
                <label>Participant</label>
                <select
                  value={newRealisation.participantId}
                  onChange={(e) => {
                    const participantId = e.target.value;
                    setNewRealisation((prev) => ({
                      ...prev,
                      participantId,
                      sessionId: "",
                    }));
                  }}
                >
                  <option value="">Choisir un participant</option>
                  {modalEligibleParticipants.length === 0 ? (
                    <option value="" disabled>Aucun participant éligible</option>
                  ) : (
                    modalEligibleParticipants.map((p) => <option key={p.id} value={p.id}>{fullName(p)}</option>)
                  )}
                </select>
                <div className="small" style={{ marginTop: 6, color: "inherit" }}>
                  Seuls les participants cotisants inscrits aux séances du référent ou de l’encadrant à la date choisie sont proposés.
                </div>
              </div>

              <div>
                <label>Voie</label>
                <input value={`${formatRouteName(realisationModalRoute)} · Corde ${realisationModalRoute.numeroCorde} · ${realisationModalRoute.cotationAjustee}`} readOnly />
              </div>

              <div>
                <label>Style</label>
                <select value={newRealisation.styleRealisation} onChange={(e) => setNewRealisation((p) => ({ ...p, styleRealisation: e.target.value }))}>
                  {Object.entries(STYLE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </div>

              <div>
                <label>Cotation proposée</label>
                <select value={newRealisation.cotationProposee} onChange={(e) => setNewRealisation((p) => ({ ...p, cotationProposee: e.target.value }))}>
                  <option value="">Aucune</option>
                  {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>

              <div>
                <label>Cotation consensus</label>
                <input value={routeAggregatesById[realisationModalRoute.id]?.consensusGrade || "Non calculée"} readOnly />
              </div>

            </div>

            <div style={{ marginTop: 12 }}>
              <label>Commentaire</label>
              <input value={newRealisation.commentaire} onChange={(e) => setNewRealisation((p) => ({ ...p, commentaire: e.target.value }))} />
            </div>

            <div className="modal-actions">
              <button className="secondary" onClick={closeRealisationModal}>Annuler</button>
              <button onClick={addRealisation} disabled={!newRealisation.selectedDay || !newRealisation.participantId || modalEligibleParticipants.length === 0}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {!sidebarOpen && (
        <nav className="mobile-bottom-nav" aria-label="Navigation mobile ClimbClubCristal">
          {visibleTabs.map((item) => (
            <button
              key={item.key}
              className={`bottom-tab ${tab === item.key ? "active" : ""}`}
              onClick={() => setTab(item.key)}
              title={item.label}
            >
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      )}

      <div className="shell">
        <div className="hero">
          <div className="topbar">
            <button className="menu-button" onClick={() => setSidebarOpen(true)} aria-label="Afficher le menu">
              ☰
            </button>
            <div className="brand">
              <img src="/logo-climbcrew.png" alt="Logo ClimbClubCristal" className="app-logo" />
              <div>
                <h1>{currentPageLabel}</h1>
              </div>
            </div>

            <div className="theme-selector-inline">
              <label htmlFor="header-theme-selector">Ambiance</label>
              <select
                id="header-theme-selector"
                value={themePreference}
                onChange={(event) => handleThemePreferenceChange(event.target.value)}
              >
                {THEME_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {tab === "inscriptions" && (
          <>
            <div className="toolbar">
              <div className="toolbar-row">
                <div className="group date-nav">
                  <button className="secondary nav-symbol" title={viewMode === "jour" ? "Jour précédent" : "Semaine précédente"} onClick={() => {
                    const d = viewMode === "jour" ? nextBusinessDay(selectedDate, -1) : nextBusinessDay(nextBusinessDay(nextBusinessDay(nextBusinessDay(nextBusinessDay(selectedDate,-1),-1),-1),-1),-1);
                    setSelectedDate(d); ensureSessionsForDate(d);
                  }}>
                    &lt;
                  </button>

                  <input
                    className="date-input date-display"
                    type="text"
                    value={formatDateFr(selectedDate)}
                    readOnly
                    aria-label="Date sélectionnée"
                  />

                  <button className="secondary nav-symbol" title={viewMode === "jour" ? "Jour suivant" : "Semaine suivante"} onClick={() => {
                    const d = viewMode === "jour" ? nextBusinessDay(selectedDate, 1) : nextBusinessDay(nextBusinessDay(nextBusinessDay(nextBusinessDay(nextBusinessDay(selectedDate,1),1),1),1),1);
                    setSelectedDate(d); ensureSessionsForDate(d);
                  }}>
                    &gt;
                  </button>
                </div>

                <div className="group view-toggle">
                  <button className={viewMode === "jour" ? "" : "secondary"} onClick={() => setViewMode("jour")}>Jour</button>
                  <button className={viewMode === "semaine" ? "" : "secondary"} onClick={() => setViewMode("semaine")}>Semaine</button>
                </div>
              </div>
            </div>

            {viewMode === "jour" ? (
              <div className="stack">{daySessions.map((session) => renderSessionCard(session))}</div>
            ) : (
              <div className="week-grid" aria-label="Semaine interactive">
                {weekSessions.map((day) => (
                  <section className="week-day-card" key={day.date}>
                    <div className="week-day-header">
                      <h3>{formatDateFr(day.date)}</h3>
                    </div>
                    <div className="week-day-sessions">
                      {day.sessions.map((session) => renderSessionCard(session, true))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </>
        )}

        {tab === "voies" && (
          <>
            {adminUnlocked && (
              <div className="card">
                <div className="card-header"><h2>Ajouter une voie</h2></div>
                <div className="grid four">
                  <div><label>Corde</label><select value={newRoute.numeroCorde} onChange={(e) => setNewRoute((p) => ({ ...p, numeroCorde: e.target.value }))}>{ROPE_NUMBERS.map((numero) => <option key={numero} value={String(numero)}>Corde {numero}</option>)}</select></div>
                  <div><label>Couleur voie</label><select value={newRoute.couleurPrises} onChange={(e) => setNewRoute((p) => ({ ...p, couleurPrises: e.target.value }))}>{ROUTE_COLORS.map((couleur) => <option key={couleur} value={couleur}>{couleur}</option>)}</select></div>
                  <div><label>Cotation</label><select value={newRoute.cotationReference} onChange={(e) => setNewRoute((p) => ({ ...p, cotationReference: e.target.value }))}>{GRADES.map((g) => <option key={g} value={g}>{g}</option>)}</select></div>
                  <div><label>Nom de la voie</label><input value={newRoute.nomVoie} onChange={(e) => setNewRoute((p) => ({ ...p, nomVoie: e.target.value }))} /></div>
                  <div><label>Ouvreur</label><input value={newRoute.nomOuvreur} onChange={(e) => setNewRoute((p) => ({ ...p, nomOuvreur: e.target.value }))} /></div>
                  <div><label>Moulinette uniquement</label><select value={newRoute.moulinetteOnly ? "oui" : "non"} onChange={(e) => setNewRoute((p) => ({ ...p, moulinetteOnly: e.target.value === "oui" }))}><option value="non">Non</option><option value="oui">Oui</option></select></div>
                  <div style={{ display: "flex", alignItems: "end" }}><button onClick={addRoute}>Ajouter</button></div>
                </div>
                {routeError && <div className="error" style={{ marginTop: 10 }}>{routeError}</div>}
              </div>
            )}

            <div className="card">
              <div className="card-header">
                <h2>Tableau des voies</h2>
                <div className="group">
                  <label htmlFor="route-sort-mode">Trier par</label>
                  <select
                    id="route-sort-mode"
                    value={routeSortMode}
                    onChange={(event) => setRouteSortMode(event.target.value)}
                    style={{ width: "auto", minWidth: 150 }}
                  >
                    <option value="corde">Corde</option>
                    <option value="cotation">Cotation</option>
                  </select>
                </div>
              </div>
              <div className="stack">
                {routeDisplayGroups.map((group) => {
                  return (
                    <div className="subcard" key={group.key}>
                      <div className="card-header">
                        <strong>{group.label}</strong>
                        <span className="badge">{group.routes.length} voie(s)</span>
                      </div>
                      {group.routes.length === 0 ? (
                        <div className="small">Aucune voie.</div>
                      ) : (
                        <div className="stack">
                          {group.routes.map((route) => {
                            return (
                              <div className={`route-card ${route.moulinetteOnly ? "moulinette-only" : ""}`} key={route.id} style={getRouteCardStyle(route.couleurPrises)}>
                                {adminUnlocked && editingRouteId === route.id && routeEditDraft ? (
                                  <>
                                    <div className="grid three">
                                      <div>
                                        <label>Corde</label>
                                        <select value={routeEditDraft.numeroCorde} onChange={(event) => setRouteEditDraft((draft) => ({ ...draft, numeroCorde: event.target.value }))}>
                                          {ROPE_NUMBERS.map((numero) => <option key={numero} value={String(numero)}>Corde {numero}</option>)}
                                        </select>
                                      </div>
                                      <div>
                                        <label>Couleur</label>
                                        <select value={routeEditDraft.couleurPrises} onChange={(event) => setRouteEditDraft((draft) => ({ ...draft, couleurPrises: event.target.value }))}>
                                          {ROUTE_COLORS.map((couleur) => <option key={couleur} value={couleur}>{couleur}</option>)}
                                        </select>
                                      </div>
                                      <div>
                                        <label>Cotation</label>
                                        <select value={routeEditDraft.cotationReference} onChange={(event) => setRouteEditDraft((draft) => ({ ...draft, cotationReference: event.target.value }))}>
                                          {GRADES.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
                                        </select>
                                      </div>
                                      <div>
                                        <label>Nom de la voie</label>
                                        <input value={routeEditDraft.nomVoie} onChange={(event) => setRouteEditDraft((draft) => ({ ...draft, nomVoie: event.target.value }))} />
                                      </div>
                                      <div>
                                        <label>Ouvreur</label>
                                        <input value={routeEditDraft.nomOuvreur} onChange={(event) => setRouteEditDraft((draft) => ({ ...draft, nomOuvreur: event.target.value }))} />
                                      </div>
                                      <div>
                                        <label>Moulinette uniquement</label>
                                        <select
                                          value={routeEditDraft.moulinetteOnly ? "oui" : "non"}
                                          onChange={(event) => setRouteEditDraft((draft) => ({ ...draft, moulinetteOnly: event.target.value === "oui" }))}
                                        >
                                          <option value="non">Non</option>
                                          <option value="oui">Oui</option>
                                        </select>
                                      </div>
                                    </div>
                                    <div className="group" style={{ marginTop: 8 }}>
                                      <button onClick={() => saveRouteEdition(route)}>Enregistrer</button>
                                      <button className="secondary" onClick={cancelRouteEdition}>Annuler</button>
                                    </div>
                                  </>
                                ) : (
                                  <div className="card-header">
                                    <strong>
                                      Corde {normalizeRopeNumber(route.numeroCorde)} · {route.cotationAjustee} · {formatRouteName(route)}
                                      {" · "}Consensus {routeAggregatesById[route.id]?.consensusGrade || "nc"}
                                    </strong>
                                    <div className="group">
                                      {route.moulinetteOnly && <span className="pill">Moulinette uniquement</span>}
                                      <button className="secondary" onClick={() => openRealisationModal(route.id, state.selectedParticipantProgress)}>Réalisation</button>
                                      {adminUnlocked && <button className="secondary" onClick={() => startRouteEdition(route)}>Modifier</button>}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {tab === "progression" && (
          <div className="card">
            <div className="grid two progression-filters">
              <div>
                <label>Consulter par grimpeur</label>
                <select
                  value={state.selectedParticipantProgress || ""}
                  onChange={(event) => {
                    const participantId = event.target.value;
                    setState((prev) => ({ ...prev, selectedParticipantProgress: participantId }));
                    if (participantId) setSelectedRouteProgress("");
                  }}
                >
                  <option value="">Choisir un grimpeur</option>
                  {alphabeticalParticipants.map((participant) => (
                    <option key={participant.id} value={participant.id}>{fullName(participant)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label>Consulter par voie</label>
                <select
                  value={selectedRouteProgress}
                  onChange={(event) => {
                    const routeId = event.target.value;
                    setSelectedRouteProgress(routeId);
                    if (routeId) {
                      setState((prev) => ({ ...prev, selectedParticipantProgress: "" }));
                    }
                  }}
                >
                  <option value="">Choisir une voie</option>
                  {state.routes.map((route) => (
                    <option key={route.id} value={route.id}>
                      {formatRouteName(route)} · corde {route.numeroCorde} · {route.cotationAjustee}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="card" style={{ marginTop: 12 }}>
              <div className="card-header"><h3>Saisir une réalisation</h3></div>
              <div className="group">
                <select
                  aria-label="Choisir la voie à réaliser"
                  value={progressEntryRouteId}
                  onChange={(event) => setProgressEntryRouteId(event.target.value)}
                  style={{ flex: "1 1 260px" }}
                >
                  <option value="">Choisir une voie</option>
                  {state.routes.map((route) => (
                    <option key={route.id} value={route.id}>
                      {formatRouteName(route)} · corde {route.numeroCorde} · {route.cotationAjustee}
                    </option>
                  ))}
                </select>
                <button
                  disabled={!progressEntryRouteId}
                  onClick={() => openRealisationModal(progressEntryRouteId, state.selectedParticipantProgress)}
                >
                  Nouvelle réalisation
                </button>
              </div>
            </div>

            {state.selectedParticipantProgress && (
              <div className="stats-grid" style={{ marginTop: 12 }}>
                <div className="stat"><div className="label">Voies réalisées</div><div className="value">{participantProgressStats.count}</div></div>
                <div className="stat"><div className="label">Meilleure cotation</div><div className="value">{participantProgressStats.bestAll || "-"}</div></div>
                <div className="stat"><div className="label">CPR actuel</div><div className="value">{participantProgressStats.cpr.currentGrade || "-"}</div></div>
                <div className="stat"><div className="label">Points</div><div className="value">{formatPoints(pointsByParticipantId[state.selectedParticipantProgress])}</div></div>
              </div>
            )}

            <div className="card" style={{ marginTop: 12 }}>
              <div className="card-header">
                <h3>
                  {state.selectedParticipantProgress
                    ? "Réalisations du grimpeur"
                    : selectedRouteProgress
                      ? "Grimpeurs ayant réalisé la voie"
                      : "Réalisations"}
                </h3>
                {(state.selectedParticipantProgress || selectedRouteProgress) && (
                  <span className="badge">{progressViewRealisations.length}</span>
                )}
              </div>

              <div className="stack">
                {!state.selectedParticipantProgress && !selectedRouteProgress ? (
                  <div className="muted-box">Choisis un grimpeur ou une voie pour afficher les réalisations.</div>
                ) : progressViewRealisations.length === 0 ? (
                  <div className="muted-box">Aucune réalisation enregistrée pour cette sélection.</div>
                ) : (
                  progressViewRealisations.map((realisation) => {
                    const participant = participantsById[realisation.participantId];
                    const route = routesById[realisation.voieId];
                    const availableSessionsForRealisation = getParticipantSessions(realisation.participantId);
                    const isIncludedInCpr = Boolean(
                      cprByParticipantId[realisation.participantId]?.timeline.some(
                        (performance) => String(performance.id) === String(realisation.id)
                      )
                    );

                    return (
                      <div className="subcard editable-realisation-card" key={realisation.id}>
                        <div className="card-header">
                          <div>
                            <strong>{fullName(participant)} — {route ? formatRouteName(route) : "Voie inconnue"}</strong>
                            <div className="small">
                              {formatDateShortFr(realisation.dateRealisation?.slice(0, 10))}
                              {" · "}
                              {STYLE_LABELS[realisation.styleRealisation] || realisation.styleRealisation}
                            </div>
                          </div>
                          <div className="group">
                            {isIncludedInCpr && <span className="pill">Prise en compte dans le CPR</span>}
                            <button className="danger" onClick={() => deleteRealisation(realisation)}>Supprimer</button>
                          </div>
                        </div>

                        <div className="grid three">
                          <div>
                            <label>Participant</label>
                            <select
                              value={realisation.participantId}
                              onChange={(event) => {
                                const participantId = event.target.value;
                                const firstSession = getParticipantSessions(participantId)[0];
                                updateRealisation(realisation.id, {
                                  participantId,
                                  sessionId: firstSession?.id || "",
                                  dateRealisation: firstSession ? `${firstSession.date}T12:00:00` : realisation.dateRealisation,
                                });
                              }}
                            >
                              {alphabeticalParticipants.map((participantOption) => (
                                <option key={participantOption.id} value={participantOption.id}>{fullName(participantOption)}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label>Séance</label>
                            <select
                              value={realisation.sessionId}
                              onChange={(event) => updateRealisation(realisation.id, { sessionId: event.target.value })}
                            >
                              {availableSessionsForRealisation.length === 0 ? (
                                <option value="">Aucune séance inscrite</option>
                              ) : (
                                availableSessionsForRealisation.map((sessionOption) => (
                                  <option key={sessionOption.id} value={sessionOption.id}>{formatDateShortFr(sessionOption.date)} · {sessionOption.slot}</option>
                                ))
                              )}
                            </select>
                          </div>

                          <div>
                            <label>Voie</label>
                            <select
                              value={realisation.voieId}
                              onChange={(event) => updateRealisation(realisation.id, { voieId: event.target.value })}
                            >
                              {state.routes.map((routeOption) => (
                                <option key={routeOption.id} value={routeOption.id}>
                                  {formatRouteName(routeOption)} · corde {routeOption.numeroCorde} · {routeOption.cotationAjustee}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label>Style</label>
                            <select
                              value={realisation.styleRealisation}
                              onChange={(event) => updateRealisation(realisation.id, { styleRealisation: event.target.value })}
                            >
                              {Object.entries(STYLE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                            </select>
                          </div>

                          <div>
                            <label>Cotation proposée</label>
                            <select
                              value={realisation.cotationProposee || ""}
                              onChange={(event) => updateRealisation(realisation.id, { cotationProposee: event.target.value })}
                            >
                              <option value="">Aucune</option>
                              {GRADES.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
                            </select>
                          </div>

                          <div>
                            <label>Cotation consensus</label>
                            <input value={routeAggregatesById[realisation.voieId]?.consensusGrade || "Non calculée"} readOnly />
                          </div>

                        </div>

                        <div style={{ marginTop: 8 }}>
                          <label>Commentaire</label>
                          <input
                            value={realisation.commentaire || ""}
                            onChange={(event) => updateRealisation(realisation.id, { commentaire: event.target.value })}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {tab === "administration" && (
          <>
            {!adminUnlocked ? (
              <div className="card">
                <div className="card-header"><h2>Accès administration</h2></div>
                <div className="grid two">
                  <div>
                    <label>Code administrateur</label>
                    <input type="password" maxLength={8} value={adminInput} onChange={(e) => setAdminInput(e.target.value.replace(/\D/g, "").slice(0, 8))} />
                  </div>
                  <div style={{ display: "flex", alignItems: "end" }}><button onClick={unlockAdmin}>Déverrouiller</button></div>
                </div>
                {adminError && <div className="error" style={{ marginTop: 10 }}>{adminError}</div>}
              </div>
            ) : (
              <>
                <div className="card">
                  <div className="card-header"><h2>Ajouter un participant</h2></div>
                  <div className="grid four">
                    <div><label>Nom</label><input value={newParticipant.nom} onChange={(e) => setNewParticipant((p) => ({ ...p, nom: e.target.value }))} /></div>
                    <div><label>Prénom</label><input value={newParticipant.prenom} onChange={(e) => setNewParticipant((p) => ({ ...p, prenom: e.target.value }))} /></div>
                    <div><label>Adresse e-mail</label><input type="email" value={newParticipant.email} onChange={(e) => setNewParticipant((p) => ({ ...p, email: e.target.value }))} /></div>
                    <div><label>Passeport</label><select value={newParticipant.passport} onChange={(e) => setNewParticipant((p) => ({ ...p, passport: e.target.value }))}><option value="sans">Sans</option><option value="jaune">Jaune</option><option value="orange">Orange</option><option value="vert">Vert</option><option value="bleu">Bleu</option><option value="decouverte">Découverte</option></select></div>
                    <div style={{ display: "flex", alignItems: "end" }}><button onClick={addParticipant}>Ajouter</button></div>
                  </div>
                  <div className="group" style={{ marginTop: 12 }}>
                    <label><input type="checkbox" checked={newParticipant.cotisation} onChange={(e) => setNewParticipant((p) => ({ ...p, cotisation: e.target.checked }))} /> Cotisation</label>
                    <label><input type="checkbox" checked={newParticipant.ffme} onChange={(e) => setNewParticipant((p) => ({ ...p, ffme: e.target.checked }))} /> FFME</label>
                    <label><input type="checkbox" checked={newParticipant.canEncadrer} onChange={(e) => setNewParticipant((p) => ({ ...p, canEncadrer: e.target.checked }))} /> Encadrant</label>
                    <label><input type="checkbox" checked={newParticipant.canReferer} onChange={(e) => setNewParticipant((p) => ({ ...p, canReferer: e.target.checked }))} /> Référent</label>
                    <label><input type="checkbox" checked={newParticipant.canAdmin} onChange={(e) => setNewParticipant((p) => ({ ...p, canAdmin: e.target.checked }))} /> Administrateur</label>
                  </div>
                </div>

                <div className="card">
                  <div className="card-header"><h2>Gestion des participants</h2></div>
                  <div className="stack">
                    {adminParticipants.map((p) => (
                      <details className="subcard participant-admin-details" key={p.id}>
                        <summary style={{ cursor: "pointer", fontWeight: 700 }}>
                          {fullName(p)}
                        </summary>
                        <div className="grid four" style={{ marginTop: 10 }}>
                          <div><label>Nom</label><input value={p.nom} onChange={(e) => updateParticipant(p.id, { nom: e.target.value })} /></div>
                          <div><label>Prénom</label><input value={p.prenom} onChange={(e) => updateParticipant(p.id, { prenom: e.target.value })} /></div>
                          <div><label>Adresse e-mail</label><input type="email" value={p.email || ""} onChange={(e) => updateParticipant(p.id, { email: e.target.value })} /></div>
                          <div><label>Passeport</label><select value={p.passport} onChange={(e) => updateParticipant(p.id, { passport: e.target.value })}><option value="sans">Sans</option><option value="jaune">Jaune</option><option value="orange">Orange</option><option value="vert">Vert</option><option value="bleu">Bleu</option><option value="decouverte">Découverte</option></select></div>
                          <div style={{ display: "flex", alignItems: "end" }}><button className="danger" onClick={() => deleteParticipant(p.id)}>Supprimer</button></div>
                        </div>
                        <div className="group" style={{ marginTop: 12 }}>
                          <label><input type="checkbox" checked={p.cotisation} onChange={(e) => updateParticipant(p.id, { cotisation: e.target.checked })} /> Cotisation</label>
                          <label><input type="checkbox" checked={p.ffme} onChange={(e) => updateParticipant(p.id, { ffme: e.target.checked })} /> FFME</label>
                          <label><input type="checkbox" checked={p.canEncadrer} onChange={(e) => updateParticipant(p.id, { canEncadrer: e.target.checked })} /> Encadrant</label>
                          <label><input type="checkbox" checked={p.canReferer} onChange={(e) => updateParticipant(p.id, { canReferer: e.target.checked })} /> Référent</label>
                          <label><input type="checkbox" checked={Boolean(p.canAdmin)} onChange={(e) => updateParticipant(p.id, { canAdmin: e.target.checked })} /> Administrateur</label>
                        </div>
                      </details>
                    ))}
                  </div>
                </div>

                <div className="card">
                  <div className="card-header"><h2>Import / export</h2></div>
                  <div className="group">
                    <button className="secondary" onClick={exportAllData}>Export JSON</button>
                    <label className="pill" style={{ cursor: "pointer" }}>
                      Import JSON
                      <input type="file" accept=".json,application/json" style={{ display: "none" }} onChange={importJsonFile} />
                    </label>
                  </div>
                  {importMessage && <div className="success" style={{ marginTop: 10 }}>{importMessage}</div>}
                </div>
              </>
            )}
          </>
        )}

        {tab === "gestion_comptes" && (
          <>
            {!USE_API ? (
              <div className="card"><div className="muted-box">La gestion des comptes est disponible avec le backend API.</div></div>
            ) : !canManageAccountsAndLogs ? (
              <div className="card"><div className="muted-box">Cette section est réservée aux administrateurs authentifiés.</div></div>
            ) : (
              <div className="card">
                <div className="card-header">
                  <h2>Gestion des comptes</h2>
                  <button className="secondary" onClick={loadAdminAccessData}>Actualiser</button>
                </div>
                <div className="small" style={{ marginBottom: 10 }}>
                  L’administrateur peut approuver une demande, répudier un compte, réactiver un accès et générer un code de réinitialisation.
                </div>
                {generatedResetToken && <div className="success" style={{ marginBottom: 12 }}>{generatedResetToken}</div>}
                <div className="stack">
                  {adminAuthUsers.length === 0 ? (
                    <div className="muted-box">Aucun compte utilisateur chargé.</div>
                  ) : (
                    adminAuthUsers.map((user) => (
                      <details className="subcard account-admin-details" key={user.id}>
                        <summary style={{ cursor: "pointer", fontWeight: 700 }}>
                          {user.prenom} {user.nom}
                        </summary>
                        <div style={{ marginTop: 10 }}>
                          <div className="card-header">
                            <div className="small">{user.email} · rôle {user.role} · statut {user.status}</div>
                            <div className="group">
                              {user.status === "pending" && <button onClick={() => approveAccessRequest(user.id)}>Approuver</button>}
                              {user.status !== "revoked" ? (
                                <button className="danger" onClick={() => revokeUserAccess(user.id)}>Répudier</button>
                              ) : (
                                <button onClick={() => reactivateUserAccess(user.id)}>Réactiver</button>
                              )}
                              <button className="secondary" onClick={() => generatePasswordResetToken(user.id)}>Code reset</button>
                            </div>
                          </div>
                          <div className="small">
                            Créé le {user.created_at ? formatDateFr(user.created_at.slice(0, 10)) : "-"}
                            {user.last_login_at ? ` · dernière connexion le ${formatDateFr(user.last_login_at.slice(0, 10))}` : " · aucune connexion"}
                          </div>
                        </div>
                      </details>
                    ))
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {tab === "logs" && (
          <>
            {!USE_API ? (
              <div className="card"><div className="muted-box">Les logs de connexion sont disponibles avec le backend API.</div></div>
            ) : !canManageAccountsAndLogs ? (
              <div className="card"><div className="muted-box">Cette section est réservée aux administrateurs authentifiés.</div></div>
            ) : (
              <div className="card">
                <div className="card-header">
                  <h2>Logs de connexion</h2>
                  <span className="badge">{adminAccessLogs.length}</span>
                </div>
                <div className="stack">
                  {adminAccessLogs.length === 0 ? (
                    <div className="muted-box">Aucun log disponible.</div>
                  ) : (
                    adminAccessLogs.map((log) => (
                      <div className="subcard" key={log.id}>
                        <div className="card-header">
                          <strong>{log.event_type}</strong>
                          <span className={`badge ${log.success ? "" : "danger"}`}>{log.success ? "OK" : "Échec"}</span>
                        </div>
                        <div className="small">
                          {log.email || "utilisateur inconnu"} · {log.created_at ? log.created_at.replace("T", " ").slice(0, 19) : "-"}
                        </div>
                        <div className="small">
                          {log.ip_address || "IP inconnue"} · {log.user_agent || "navigateur inconnu"}
                        </div>
                        {log.details_text && <div className="small">Détails : {log.details_text}</div>}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {tab === "wall_of_fame" && (
          <>
            <div className="card">
              <div className="card-header">
                <h2>Wall of Fame</h2>
                <span className="small">Les trois meilleurs de chaque classement</span>
              </div>
              <div className="grid three">
                {wallOfFameCategories.map((category) => (
                  <div className="subcard" key={category.title}>
                    <div className="card-header">
                      <h3>{category.title}</h3>
                    </div>
                    <div className="stack">
                      {category.entries.length === 0 ? (
                        <div className="muted-box">Pas encore de classement.</div>
                      ) : (
                        category.entries.map((entry) => (
                          <div
                            className="participant-row passport-row"
                            key={entry.participant.id}
                            style={getPassportStyle(entry.participant)}
                            data-passport={normalizePassport(entry.participant.passport)}
                          >
                            <span className="participant-identity">
                              <span aria-hidden="true">
                                {entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : "🥉"}
                              </span>
                              <span className="passport-dot" style={getPassportDotStyle(entry.participant)} aria-hidden="true" />
                              <span className="participant-name">{fullName(entry.participant)}</span>
                            </span>
                            <strong style={{ color: "inherit" }}>{entry.displayValue}</strong>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {tab === "statistiques" && (
          <>
            <div className="stats-grid">
              <div className="stat"><div className="label">Inscrits uniques</div><div className="value">{sessionStats.nombreInscrits}</div></div>
              <div className="stat"><div className="label">Cotisations</div><div className="value">{sessionStats.nombreCotisations}</div></div>
              <div className="stat"><div className="label">FFME</div><div className="value">{sessionStats.nombreFFME}</div></div>
              <div className="stat"><div className="label">Voies actives</div><div className="value">{sessionStats.nombreVoiesActives}</div></div>
              <div className="stat"><div className="label">Réalisations</div><div className="value">{sessionStats.nombreRealisations}</div></div>
              <div className="stat"><div className="label">Réalisations en tête</div><div className="value">{leadRealisationStats.total}</div></div>
            </div>

            <div className="card">
              <div className="card-header">
                <h2>Réalisations en tête par cotation</h2>
                <span className="badge">{leadRealisationStats.total} au total</span>
              </div>
              <div className="stack">
                {leadRealisationStats.byGrade.length === 0 ? (
                  <div className="muted-box">Aucune voie ou réalisation en tête à analyser.</div>
                ) : (
                  leadRealisationStats.byGrade.map((entry) => (
                    <div className="participant-row lead-grade-row" key={entry.grade}>
                      <strong style={{ color: "#ffffff" }}>{entry.grade}</strong>
                      <span className="small" style={{ color: "#ffffff" }}>
                        {entry.routeCount} voie{entry.routeCount > 1 ? "s" : ""}
                        {" · "}{entry.leadCount} réalisation{entry.leadCount > 1 ? "s" : ""} en tête
                        {" · "}Ratio : {entry.ratio === null
                          ? "nc"
                          : entry.ratio.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <h2>Liste des inscrits</h2>
                <div className="group">
                  <div
                    className="stats-sort-field"
                    style={{ display: "grid", gridTemplateColumns: "auto minmax(160px, 1fr)", gap: 8, alignItems: "center", minWidth: 250 }}
                  >
                    <label style={{ margin: 0 }}>Trier par</label>
                    <select value={statsSortField} onChange={(e) => setStatsSortField(e.target.value)}>
                      <option value="name">Nom</option>
                      <option value="passport">Passeport</option>
                      <option value="cotisation">Cotisation</option>
                      <option value="ffme">Licence FFME</option>
                      <option value="cpr">CPR</option>
                      <option value="points">Points</option>
                      <option value="participations">Participations</option>
                    </select>
                  </div>
                  <button
                    className="secondary"
                    onClick={() => setStatsSortDirection((value) => (value === "asc" ? "desc" : "asc"))}
                    title="Inverser le tri"
                  >
                    {statsSortDirection === "asc" ? "↑" : "↓"}
                  </button>
                </div>
              </div>
              <div className="stack">
                {sortedStatsParticipants.map((participant) => (
                  <div className="participant-row passport-row stats-participant-row" key={participant.id} style={getPassportStyle(participant)} data-passport={normalizePassport(participant.passport)}>
                    <span className="participant-identity">
                      <span className="passport-dot" style={getPassportDotStyle(participant)} aria-hidden="true" />
                      <span className="participant-name">{fullName(participant)}</span>
                    </span>
                    <span className="small" style={{ color: "inherit" }}>Cotisation : {participant.cotisation ? "Oui" : "Non"} · FFME : {participant.ffme ? "Oui" : "Non"} · CPR : {cprByParticipantId[participant.id]?.currentGrade || "Non calculé"} · Points : {formatPoints(pointsByParticipantId[participant.id])} · Participations : {sessionStats.participationCount[participant.id] || 0} · Passeport : {participant.passport}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {tab === "faq" && (
          <div className="card">
            <div className="card-header">
              <h2>FAQ – fonctionnement de ClimbClubCristal</h2>
              <span className="small">Version : {APP_VERSION}</span>
            </div>

            <details className="faq-item">
              <summary><strong>À quoi sert ClimbClubCristal ?</strong></summary>
              <div className="small">
                ClimbClubCristal permet de gérer les séances en vues Jour et Semaine, les inscriptions, les participants, les voies et la progression des grimpeurs du site SAE de Cristal. Une séance peut être Libre, Encadrée, Passeport, Challenge, Renouvellement ou Fermée. Le bandeau supérieur indique toujours la page active.
              </div>
            </details>

            <details className="faq-item">
              <summary><strong>Comment enregistrer une voie réalisée ?</strong></summary>
              <div className="small">
                Dans l’onglet Voies, le bouton « Réalisation » ouvre la saisie. Si un jour est choisi, seuls les participants cotisants inscrits ce jour-là sont proposés. Si un participant est choisi, seuls ses jours d’inscription sont proposés. La saisie ne distingue pas les créneaux midi et soir.
              </div>
            </details>

            <details className="faq-item">
              <summary><strong>Comment sont présentés les participants et les voies ?</strong></summary>
              <div className="small">
                Pour un participant, la bille placée à gauche du nom indique la couleur du passeport. Le cadre est vert si la cotisation est réglée et rouge sinon ; il est plein avec une licence FFME et en pointillés sans licence. En séance Libre, un fond hachuré signale une personne déjà inscrite sans passeport requis. Pour une voie, le fond reprend la couleur des prises et un cadre rouge indique une voie uniquement en moulinette.
              </div>
            </details>

            <details className="faq-item">
              <summary><strong>Que signifie CPR ?</strong></summary>
              <div className="small">
                Le CPR représente le niveau récent du grimpeur. Le calcul examine les réalisations des 90 derniers jours et convertit chaque cotation en indice, de 4a à 7b. Cet indice est multiplié par le coefficient du style : à vue 1,25 ; flash 1,20 ; en tête 1,00 ; moulinette 0,85 ; travaillée 0,75 ; avec repos 0,60 ; projet 0,30 ; non enchaînée 0,20 ; essai ou test 0,10. Les performances sont ensuite classées par indice pondéré et seules les 10 meilleures sont conservées. La moyenne de leurs indices pondérés est arrondie à l’indice de cotation le plus proche, puis reconvertie en cotation. S’il existe moins de 10 réalisations valides, le calcul utilise uniquement celles disponibles. Une voie facile d’échauffement ne réduit donc pas le CPR si elle ne figure pas parmi les 10 meilleures performances récentes.
              </div>
            </details>

            <details className="faq-item">
              <summary><strong>Comment est calculée la cotation consensus ?</strong></summary>
              <div className="small">
                Le consensus utilise uniquement les cotations proposées pour la voie. Chaque cotation est convertie en indice de 4a = 0 à 7b = 14. L’indice CPR utilisé est limité à l’intervalle 0–14. Le poids d’un avis vaut 1 + (indice CPR du grimpeur ÷ 14) : il varie donc de 1 à 2. Sans CPR calculable, le poids reste égal à 1. La formule est : somme des indices proposés multipliés par leur poids, divisée par la somme des poids. Le résultat est arrondi à l’indice le plus proche puis reconverti en cotation. Ainsi, tous les avis comptent, tandis que l’expérience récente mesurée par le CPR augmente progressivement leur poids sans jamais le doubler au-delà de 2.
              </div>
            </details>

            <details className="faq-item">
              <summary><strong>Comment sont calculées les statistiques des réalisations en tête ?</strong></summary>
              <div className="small">
                Le total correspond à tous les enregistrements dont le style est « En tête ». Pour chaque cotation, l’application compte les voies disponibles et les réalisations en tête enregistrées sur ces voies. Le ratio est égal au nombre de réalisations en tête divisé par le nombre de voies de la cotation. Il représente donc le nombre moyen de réalisations en tête par voie et peut dépasser 1. Sans voie pour une cotation, le ratio est indiqué « nc ».
              </div>
            </details>

            <details className="faq-item">
              <summary><strong>Comment fonctionne le Wall of Fame ?</strong></summary>
              <div className="small">
                Le Wall of Fame affiche les trois premiers grimpeurs pour le CPR, les points, les participations, le nombre total de réalisations réussies, les voies distinctes réalisées, les voies réalisées en tête et les records sur une séance. Le nombre total compte chaque réalisation réussie, même si une voie est refaite lors d’une autre séance. Pour les records d’une séance, une même voie n’est comptée qu’une fois. La difficulté cumulée attribue 1 point à 4a, puis un point supplémentaire par niveau jusqu’à 15 points pour 7b, avant d’additionner les voies de la séance. Les personnes ayant la même valeur conservent le même rang.
              </div>
            </details>

            <details className="faq-item">
              <summary><strong>Comment fonctionne la règle des 1 000 points ?</strong></summary>
              <div className="small">
                Chaque voie distribue exactement 1 000 points entre les grimpeurs distincts qui l’ont enregistrée avec le style « En tête ». La part reçue pour une voie est donc égale à 1 000 divisé par le nombre de grimpeurs concernés. Par exemple, une personne seule reçoit 1 000 points ; quatre personnes reçoivent 250 points chacune. Plusieurs enregistrements en tête de la même voie par le même grimpeur ne lui donnent qu’une seule part. Les réalisations dans les autres styles ne distribuent pas de points. Le total d’un grimpeur est la somme de ses parts sur toutes les voies.
              </div>
            </details>

            {canAccessAdminTabs && (
              <>
                <details className="faq-item">
                  <summary><strong>Qui peut accéder à Administration, Gestion des comptes et Log ?</strong></summary>
                  <div className="small">
                    Ces pages sont réservées aux administrateurs et ne sont pas affichées dans la navigation des utilisateurs standards.
                  </div>
                </details>

                <details className="faq-item">
                  <summary><strong>À quoi servent Gestion des comptes et Log ?</strong></summary>
                  <div className="small">
                    Gestion des comptes permet d’approuver, révoquer, réactiver et réinitialiser les accès. Log présente les événements utiles de connexion et d’authentification ; les changements d’ambiance n’y sont pas enregistrés.
                  </div>
                </details>
              </>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

export default App;
