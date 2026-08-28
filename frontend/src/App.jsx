import React, { useEffect, useMemo, useState } from "react";

import Button from "./components/Button.jsx";
import FaqSection from "./sections/FaqSection.jsx";
import Inscriptions from "./pages/Inscriptions.jsx";
import Voies from "./pages/Voies.jsx";
import Progression from "./pages/Progression.jsx";
import Profil from "./pages/Profil.jsx";
import Parametres from "./pages/Parametres.jsx";
import Administration from "./pages/Administration.jsx";
import GestionComptes from "./pages/GestionComptes.jsx";
import Logs from "./pages/Logs.jsx";
import Statistiques from "./pages/Statistiques.jsx";
import WallOfFame from "./pages/WallOfFame.jsx";

import { THEME_OPTIONS, THEME_PREFERENCE_KEY, resolveThemePreference } from "./lib/theme.js";
import { ROPE_NUMBERS, ROUTE_COLORS, STYLE_LABELS, ROUTE_TAGS, THECRAG_STYLE_BY_CLIMBCREW, TABS } from "./lib/ui-config.js";
import {
  GRADES,
  MAX_PARTICIPANTS,
  fullName,
  formatRouteName,
  formatRouteForRealisation,
  normalizeRopeNumber,
  todayIso,
  defaultSessionStatus,
  normalizePassport,
  getPassportStyle,
  getPassportDotStyle,
  gradeToIndex,
  getRouteCardStyle,
  formatDateFr,
  formatDateShortFr,
  formatPoints,
  nextBusinessDay,
  calculateSimpleCpr,
  isSuccessfulLeadRealisation,
  isSuccessfulRealisation,
  getRealisationWeight,
  calculateLeadRealisationStats,
  calculateLeadPoints,
  calculateRouteAggregates,
  calculateWallOfFameCategories,
} from "./lib/domain.js";
import { USE_API, apiFetch, authApiFetch, downloadFile } from "./lib/api.js";
import { normalizeAppData } from "./lib/normalize.js";
import { APP_VERSION } from "./lib/version.js";
import { buildCsv, csvFileSlug } from "./lib/csv.js";

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
const PASSWORD_RULE_TEXT = "8 caractères minimum, dont 1 majuscule, 1 minuscule, 1 chiffre et 1 caractère spécial.";

function isStrongPassword(value) {
  return typeof value === "string"
    && value.length >= 8
    && /[a-z]/.test(value)
    && /[A-Z]/.test(value)
    && /\d/.test(value)
    && /[^A-Za-z0-9]/.test(value);
}

function App() {
  const [tab, setTab] = useState("inscriptions");
  const [viewMode, setViewMode] = useState("jour");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [statsSortField, setStatsSortField] = useState("name");
  const [statsSortDirection, setStatsSortDirection] = useState("asc");
  const [wallOfFameSexFilter, setWallOfFameSexFilter] = useState("all");
  const [recentlyAddedParticipantIds, setRecentlyAddedParticipantIds] = useState([]);
  const [state, setState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const base = saved ? JSON.parse(saved) : IMPORTED_DATA;
      return normalizeAppData({ ...base, selectedDate: todayIso(), selectedParticipantProgress: "" }, IMPORTED_DATA);
    } catch {
      return normalizeAppData({ ...IMPORTED_DATA, selectedDate: todayIso(), selectedParticipantProgress: "" }, IMPORTED_DATA);
    }
  });
  const [adminInput, setAdminInput] = useState("");
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [routeError, setRouteError] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [, setSyncMessage] = useState(USE_API ? "API activée" : "Mode local");
  const [confirmationMessage, setConfirmationMessage] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [authToken, setAuthToken] = useState(() => (USE_API ? "cookie" : ""));
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(USE_API);
  const [authView, setAuthView] = useState("login");
  const [authError, setAuthError] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [requestAccessForm, setRequestAccessForm] = useState({ prenom: "", nom: "", email: "", password: "", confirmPassword: "", acceptTerms: false });
  const [forgotPasswordForm, setForgotPasswordForm] = useState({ email: "" });
  const [resetPasswordForm, setResetPasswordForm] = useState({ email: "", token: "", password: "", confirmPassword: "" });
  const [adminAuthUsers, setAdminAuthUsers] = useState([]);
  const [adminAccessLogs, setAdminAccessLogs] = useState([]);
  const [generatedResetToken, setGeneratedResetToken] = useState("");
  const [pendingBroadcastMessages, setPendingBroadcastMessages] = useState([]);
  const [broadcastMessageError, setBroadcastMessageError] = useState("");
  const [themePreference, setThemePreference] = useState(() => localStorage.getItem(THEME_PREFERENCE_KEY) || "auto");
  const [newParticipant, setNewParticipant] = useState({ nom: "", prenom: "", email: "", passport: "sans", sexe: "", cotisation: false, ffme: false, canEncadrer: false, canReferer: false, canAdmin: false });
  const [newRoute, setNewRoute] = useState({ numeroCorde: "", couleurPrises: "", cotationReference: "", nomVoie: "", nomOuvreur: "", moulinetteOnly: false, tags: [] });
  const [editingRouteId, setEditingRouteId] = useState("");
  const [routeEditDraft, setRouteEditDraft] = useState(null);
  const [savingRouteId, setSavingRouteId] = useState("");
  const [routeSortMode, setRouteSortMode] = useState("corde");
  const [newRealisation, setNewRealisation] = useState({ participantId: "", selectedDay: "", sessionId: "", voieId: IMPORTED_DATA.routes?.[0]?.id || "", styleRealisation: "a_vue", commentaire: "", cotationProposee: "", rating: 0, chute: false, assureurId: "" });
  const [realisationModalRouteId, setRealisationModalRouteId] = useState(null);
  const [selectedRouteProgress, setSelectedRouteProgress] = useState("");
  const [expandedRealisationIds, setExpandedRealisationIds] = useState([]);

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }, [state]);
  useEffect(() => {
    if (!confirmationMessage) return undefined;
    const timeoutId = window.setTimeout(() => setConfirmationMessage(""), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [confirmationMessage]);

  useEffect(() => {
    const applyTheme = () => {
      const resolvedTheme = resolveThemePreference(themePreference);
      document.documentElement.dataset.theme = resolvedTheme;
      document.documentElement.dataset.themePreference = themePreference;
      localStorage.setItem(THEME_PREFERENCE_KEY, themePreference);
    };
    applyTheme();
    if (themePreference !== "auto" || typeof window.matchMedia !== "function") return undefined;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemThemeChange = () => applyTheme();
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", onSystemThemeChange);
      return () => mediaQuery.removeEventListener("change", onSystemThemeChange);
    }
    mediaQuery.addListener(onSystemThemeChange);
    return () => mediaQuery.removeListener(onSystemThemeChange);
  }, [themePreference]);

  async function reloadApiState({ isMounted = () => true } = {}) {
    setIsSyncing(true);
    try {
      const [participants, sessions, realisations, ropes, routes] = await Promise.all([
        apiFetch("/participants"), apiFetch("/sessions"), apiFetch("/realisations").catch(() => []), apiFetch("/ropes").catch(() => []), apiFetch("/routes").catch(() => []),
      ]);
      if (!isMounted()) return null;
      setState((prev) => ({ ...prev, participants: Array.isArray(participants) ? participants : prev.participants, sessions: Array.isArray(sessions) && sessions.length ? sessions : prev.sessions, realisations: Array.isArray(realisations) ? realisations : prev.realisations, ropes: Array.isArray(ropes) && ropes.length ? ropes : prev.ropes, routes: Array.isArray(routes) && routes.length ? routes : prev.routes }));
      setSyncMessage("Données actualisées");
      return { participants, sessions, realisations, ropes, routes };
    } catch (e) {
      if (isMounted()) { setSyncMessage("API indisponible · fallback local"); console.error(e); }
      throw e;
    } finally { if (isMounted()) setIsSyncing(false); }
  }

  useEffect(() => { if (!USE_API) return; let mounted = true; reloadApiState({ isMounted: () => mounted }).catch(() => {}); return () => { mounted = false; }; }, []);
  useEffect(() => {
    if (!USE_API) { setAuthLoading(false); return; }
    let isMounted = true;
    (async () => {
      try {
        setAuthLoading(true);
        const data = await authApiFetch("/auth/me", authToken);
        if (!isMounted) return;
        setAuthUser(data.user);
        if (data.user?.theme_preference) setThemePreference(data.user.theme_preference);
        if (data.user?.role === "admin") setAdminUnlocked(true);
        await reloadApiState({ isMounted: () => isMounted }).catch(() => {});
      } catch {
        if (!isMounted) return;
        setAuthUser(null); setAuthToken("");
      } finally { if (isMounted) setAuthLoading(false); }
    })();
    return () => { isMounted = false; };
  }, [authToken]);

  useEffect(() => {
    if (!USE_API || !authUser?.id) { setPendingBroadcastMessages([]); return; }
    let isMounted = true;
    authApiFetch("/auth/broadcast-messages/pending", authToken)
      .then((data) => { if (isMounted) setPendingBroadcastMessages(Array.isArray(data.messages) ? data.messages : []); })
      .catch((error) => { if (isMounted) setBroadcastMessageError(String(error.message || error)); });
    return () => { isMounted = false; };
  }, [authUser?.id, authToken]);

  const canAccessAdminTabs = !USE_API || authUser?.role === "admin";
  const canManageAccountsAndLogs = USE_API && authUser?.role === "admin";
  const visibleTabs = useMemo(() => TABS.filter((item) => !item.adminOnly || canAccessAdminTabs), [canAccessAdminTabs]);
  const participantsById = useMemo(() => Object.fromEntries(state.participants.map((p) => [p.id, p])), [state.participants]);
  const routesById = useMemo(() => Object.fromEntries(state.routes.map((r) => [r.id, r])), [state.routes]);
  const sessionsById = useMemo(() => Object.fromEntries(state.sessions.map((s) => [s.id, s])), [state.sessions]);
  const myParticipantId = authUser?.participantId ? String(authUser.participantId) : "";
  const myParticipant = participantsById[myParticipantId] || null;
  const myRealisations = useMemo(() => myParticipantId ? state.realisations.filter((r) => String(r.participantId) === myParticipantId).sort((a, b) => b.dateRealisation.localeCompare(a.dateRealisation)) : [], [state.realisations, myParticipantId]);
  const cprByParticipantId = useMemo(() => Object.fromEntries(state.participants.map((participant) => [participant.id, calculateSimpleCpr(state.realisations.filter((realisation) => String(realisation.participantId) === String(participant.id)), routesById)])), [state.participants, state.realisations, routesById]);
  const pointsByParticipantId = useMemo(() => calculateLeadPoints(state.participants, state.routes, state.realisations), [state.participants, state.routes, state.realisations]);
  const sessionStats = useMemo(() => {
    const unique = new Set(state.sessions.flatMap((s) => s.participantIds));
    const participationCount = {};
    state.sessions.forEach((session) => session.participantIds.forEach((id) => { participationCount[id] = (participationCount[id] || 0) + 1; }));
    return { nombreInscrits: unique.size, nombreCotisations: state.participants.filter((p) => p.cotisation).length, nombreFFME: state.participants.filter((p) => p.ffme).length, nombreRealisations: state.realisations.length, nombreVoiesActives: state.routes.filter((r) => r.active).length, participationCount, sortedParticipants: [...state.participants].sort((a, b) => fullName(a).localeCompare(fullName(b), "fr")) };
  }, [state]);
  const myProfileStats = useMemo(() => {
    const gradesAll = myRealisations.map((r) => routesById[r.voieId]?.cotationAjustee).filter(Boolean);
    const bestAll = gradesAll.length ? gradesAll.reduce((best, current) => (gradeToIndex(current) > gradeToIndex(best) ? current : best)) : null;
    return { count: myRealisations.length, bestAll };
  }, [myRealisations, routesById]);
  const alphabeticalParticipants = useMemo(() => [...state.participants].sort((a, b) => fullName(a).localeCompare(fullName(b), "fr")), [state.participants]);

  async function updateMyProfile(patch) {
    if (!myParticipant || !USE_API) return;
    const previous = myParticipant;
    const optimistic = { ...previous, ...patch };
    setState((prev) => ({ ...prev, participants: prev.participants.map((participant) => String(participant.id) === myParticipantId ? optimistic : participant) }));
    try {
      const updated = await apiFetch("/participants/me/profile", {
        method: "PATCH",
        body: JSON.stringify({
          avatarId: optimistic.avatarId || "gecko",
          crestId: optimistic.crestId || "cristal",
          profilePublic: optimistic.profilePublic !== false,
          customAvatarImage: optimistic.customAvatarImage || "",
          sexe: optimistic.sexe || "",
        }),
      });
      setState((prev) => ({ ...prev, participants: prev.participants.map((participant) => String(participant.id) === myParticipantId ? updated : participant) }));
      setConfirmationMessage("Préférences du profil enregistrées.");
    } catch (error) {
      setState((prev) => ({ ...prev, participants: prev.participants.map((participant) => String(participant.id) === myParticipantId ? previous : participant) }));
      setSyncMessage("Erreur d'enregistrement du profil");
      console.error(error);
    }
  }

  /* Les fonctions métier restantes sont conservées dans la version précédente. */
  return <div className="app"><div className="shell"><div className="hero"><div className="topbar"><div className="brand"><img src="/logo-climbcrew.png" alt="Logo ClimbClubCristal" className="app-logo" /><div><div className="brand-title-row"><h1>ClimbClubCristal</h1><span className="topbar-version">v{APP_VERSION}</span></div></div></div></div></div><Profil USE_API={USE_API} authUser={authUser} myParticipant={myParticipant} myParticipantId={myParticipantId} myRealisations={myRealisations} allRealisations={state.realisations} myProfileStats={myProfileStats} cprByParticipantId={cprByParticipantId} pointsByParticipantId={pointsByParticipantId} sessionStats={sessionStats} routesById={routesById} getParticipantSessions={(participantId) => state.sessions.filter((s) => s.participantIds?.includes(participantId))} getPassportStyle={getPassportStyle} getPassportDotStyle={getPassportDotStyle} normalizePassport={normalizePassport} updateMyProfile={updateMyProfile} exportMyRealisationsCsv={() => {}} /></div>;
}

export default App;
