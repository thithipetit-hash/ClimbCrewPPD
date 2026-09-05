import React, { useEffect, useMemo } from "react";

import Button from "./components/Button.jsx";
import AuthPage from "./components/AuthPage.jsx";
import AppSidebar from "./components/AppSidebar.jsx";
import MobileBottomNav from "./components/MobileBottomNav.jsx";
import BroadcastMessageModal from "./components/BroadcastMessageModal.jsx";
import RealisationModal from "./components/RealisationModal.jsx";
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
import { ROPE_NUMBERS, ROUTE_COLORS, STYLE_LABELS, ROUTE_TAGS, TABS } from "./lib/ui-config.js";
import {
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
import { USE_API, apiFetch, downloadFile } from "./lib/api.js";
import { normalizeAppData } from "./lib/normalize.js";
import { APP_VERSION } from "./lib/version.js";
import { buildCsv, csvFileSlug } from "./lib/csv.js";
import { EMPTY_APP_DATA, useAppBusinessState } from "./hooks/useAppBusinessState.js";
import { useAppUiState } from "./hooks/useAppUiState.js";
import { useAuthState } from "./hooks/useAuthState.js";
import { useAppBootstrap } from "./hooks/useAppBootstrap.js";
import { useParticipantEditorState } from "./hooks/useParticipantEditorState.js";
import { useRouteEditorState } from "./hooks/useRouteEditorState.js";
import { useRealisationEditorState } from "./hooks/useRealisationEditorState.js";
import { PASSWORD_RULE_TEXT, isStrongPassword } from "./lib/password-policy.js";
import { buildRouteDisplayGroups } from "./lib/route-display-groups.js";
import { theCragStyleForRealisation } from "./lib/thecrag.js";
import {
  buildRealisationDraft,
  buildRealisationPayload,
  getParticipantSessionDays,
  isManagedSession,
  resolveSessionIdForRealisation,
} from "./lib/realisation-workflow.js";

const ADMIN_CODE = import.meta.env.VITE_LEGACY_ADMIN_CODE || "";

function App() {
  const {
    tab, setTab,
    viewMode, setViewMode,
    sidebarOpen, setSidebarOpen,
    statsSortField, setStatsSortField,
    statsSortDirection, setStatsSortDirection,
    wallOfFameSexFilter, setWallOfFameSexFilter,
    recentlyAddedParticipantIds, setRecentlyAddedParticipantIds,
    adminInput, setAdminInput,
    adminUnlocked, setAdminUnlocked,
    adminError, setAdminError,
    routeError, setRouteError,
    importMessage, setImportMessage,
    setSyncMessage,
    confirmationMessage, setConfirmationMessage,
    isSyncing, setIsSyncing,
  } = useAppUiState({ useApi: USE_API });
  const [state, setState] = useAppBusinessState({ useApi: USE_API });

  const {
    authUser, setAuthUser,
    authLoading, setAuthLoading,
    authView, setAuthView,
    authError, setAuthError,
    authMessage, setAuthMessage,
    loginForm, setLoginForm,
    requestAccessForm, setRequestAccessForm,
    forgotPasswordForm, setForgotPasswordForm,
    resetPasswordForm, setResetPasswordForm,
    adminAuthUsers, setAdminAuthUsers,
    adminAccessLogs, setAdminAccessLogs,
    generatedResetToken, setGeneratedResetToken,
    pendingBroadcastMessages, setPendingBroadcastMessages,
    broadcastMessageError, setBroadcastMessageError,
    themePreference, setThemePreference,
  } = useAuthState({ useApi: USE_API, themePreferenceKey: THEME_PREFERENCE_KEY });

  const { newParticipant, setNewParticipant } = useParticipantEditorState();
  const {
    newRoute, setNewRoute,
    editingRouteId, setEditingRouteId,
    routeEditDraft, setRouteEditDraft,
    savingRouteId, setSavingRouteId,
    routeSortMode, setRouteSortMode,
  } = useRouteEditorState();
  const {
    newRealisation, setNewRealisation,
    realisationModalRouteId, setRealisationModalRouteId,
    selectedRouteProgress, setSelectedRouteProgress,
    expandedRealisationIds, setExpandedRealisationIds,
  } = useRealisationEditorState({ defaultRouteId: EMPTY_APP_DATA.routes?.[0]?.id || "" });

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

  const { reloadApiState } = useAppBootstrap({
    useApi: USE_API,
    authUserId: authUser?.id,
    setAuthUser,
    setAuthLoading,
    setThemePreference,
    setAdminUnlocked,
    setPendingBroadcastMessages,
    setBroadcastMessageError,
    setState,
    setIsSyncing,
    setSyncMessage,
  });

  const canAccessAdminTabs = !USE_API || authUser?.role === "admin";
  const canManageAccountsAndLogs = USE_API && authUser?.role === "admin";
  const visibleTabs = useMemo(
    () => TABS.filter((item) => !item.adminOnly || canAccessAdminTabs),
    [canAccessAdminTabs]
  );
  const currentPageLabel = TABS.find((item) => item.key === tab)?.label || "";

  useEffect(() => {
    if (tab === "parametres") return;
    if (visibleTabs.some((item) => item.key === tab)) return;
    setTab("inscriptions");
  }, [tab, visibleTabs]);

  useEffect(() => {
    if (canManageAccountsAndLogs && ["administration", "gestion_comptes", "logs"].includes(tab)) {
      loadAdminAccessData();
    }
  }, [tab, canManageAccountsAndLogs, authUser?.id]);

  const participantsById = useMemo(
    () => Object.fromEntries(state.participants.map((p) => [p.id, p])),
    [state.participants]
  );
  const routesById = useMemo(
    () => Object.fromEntries(state.routes.map((r) => [r.id, r])),
    [state.routes]
  );

  const routeDisplayGroups = useMemo(
    () => buildRouteDisplayGroups({
      routes: state.routes,
      ropes: state.ropes,
      sortMode: routeSortMode,
    }),
    [routeSortMode, state.routes, state.ropes],
  );

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

  const modalAllAvailableDays = useMemo(() => {
    return [...new Set(
      sortedSessionsByDate
        .filter(isManagedSession)
        .map((session) => session.date)
    )];
  }, [sortedSessionsByDate]);

  const modalAllEligibleParticipants = useMemo(() => {
    return [...state.participants]
      .filter((participant) => Boolean(participant.cotisation))
      .filter((participant) => getParticipantSessionDays(state.sessions, participant.id).length > 0)
      .sort((a, b) => fullName(a).localeCompare(fullName(b), "fr"));
  }, [state.participants, state.sessions]);

  const modalAvailableDays = useMemo(() => {
    if (!newRealisation.participantId) return modalAllAvailableDays;
    return getParticipantSessionDays(state.sessions, newRealisation.participantId);
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

  const allProgressRealisationsExpanded = progressViewRealisations.length > 0
    && progressViewRealisations.every((realisation) => expandedRealisationIds.includes(realisation.id));

  function toggleAllProgressRealisations() {
    const visibleIds = progressViewRealisations.map((realisation) => realisation.id);
    setExpandedRealisationIds((currentIds) => {
      if (visibleIds.every((id) => currentIds.includes(id))) {
        return currentIds.filter((id) => !visibleIds.includes(id));
      }
      return [...new Set([...currentIds, ...visibleIds])];
    });
  }

  function setRealisationExpanded(realisationId, expanded) {
    setExpandedRealisationIds((currentIds) => expanded
      ? [...new Set([...currentIds, realisationId])]
      : currentIds.filter((id) => id !== realisationId));
  }

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
    () => calculateLeadPoints(state.participants, state.routes, state.realisations),
    [state.participants, state.routes, state.realisations],
  );

  const myParticipantId = authUser?.participantId ? String(authUser.participantId) : "";
  const myParticipant = participantsById[myParticipantId] || null;

  const myRealisations = useMemo(() => {
    if (!myParticipantId) return [];
    return state.realisations
      .filter((r) => String(r.participantId) === myParticipantId)
      .sort((a, b) => b.dateRealisation.localeCompare(a.dateRealisation));
  }, [state.realisations, myParticipantId]);

  const myProfileStats = useMemo(() => {
    const gradesAll = myRealisations.map((r) => routesById[r.voieId]?.cotationAjustee).filter(Boolean);
    const bestAll = gradesAll.length
      ? gradesAll.reduce((best, current) => (gradeToIndex(current) > gradeToIndex(best) ? current : best))
      : null;

    return { count: myRealisations.length, bestAll };
  }, [myRealisations, routesById]);

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
    () => calculateRouteAggregates(state.routes, state.realisations, cprByParticipantId),
    [state.routes, state.realisations, cprByParticipantId],
  );

  const leadRealisationStats = useMemo(
    () => calculateLeadRealisationStats(state.routes, state.realisations, routesById),
    [state.routes, state.realisations, routesById],
  );

  const routeRatingsById = useMemo(() => {
    const ratings = {};
    state.realisations.forEach((realisation) => {
      const rating = Number(realisation.rating);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) return;
      const current = ratings[realisation.voieId] || { total: 0, count: 0, average: 0 };
      current.total += rating;
      current.count += 1;
      current.average = current.total / current.count;
      ratings[realisation.voieId] = current;
    });
    return ratings;
  }, [state.realisations]);

  const topRouteRankings = useMemo(() => {
    const entries = state.routes.map((route) => {
      const routeRealisations = state.realisations.filter((item) => item.voieId === route.id);
      const rating = routeRatingsById[route.id] || { average: 0, count: 0 };
      return {
        route,
        ratingAverage: rating.average,
        ratingCount: rating.count,
        realisationCount: routeRealisations.length,
        leadCount: routeRealisations.filter((item) => isSuccessfulLeadRealisation(item, route)).length,
      };
    });
    const takeFive = (items, compare) => [...items].sort(compare).slice(0, 5);
    return [
      {
        title: "Voies les mieux notées",
        entries: takeFive(entries.filter((item) => item.ratingCount > 0), (a, b) => b.ratingAverage - a.ratingAverage || b.ratingCount - a.ratingCount),
        value: (item) => `★ ${item.ratingAverage.toFixed(1)} (${item.ratingCount})`,
      },
      {
        title: "Voies les plus réalisées",
        entries: takeFive(entries.filter((item) => item.realisationCount > 0), (a, b) => b.realisationCount - a.realisationCount),
        value: (item) => `${item.realisationCount} réalisation${item.realisationCount > 1 ? "s" : ""}`,
      },
      {
        title: "Voies les plus réalisées en tête",
        entries: takeFive(entries.filter((item) => item.leadCount > 0), (a, b) => b.leadCount - a.leadCount),
        value: (item) => `${item.leadCount} en tête`,
      },
      {
        title: "Mieux notées avec au moins 3 avis",
        entries: takeFive(entries.filter((item) => item.ratingCount >= 3), (a, b) => b.ratingAverage - a.ratingAverage || b.ratingCount - a.ratingCount),
        value: (item) => `★ ${item.ratingAverage.toFixed(1)} (${item.ratingCount})`,
      },
    ];
  }, [state.routes, state.realisations, routeRatingsById]);

  const wallOfFameCategories = useMemo(
    () => calculateWallOfFameCategories({
      participants: state.participants.filter((participant) => (
        wallOfFameSexFilter === "all" || participant.sexe === wallOfFameSexFilter
      )),
      realisations: state.realisations,
      routesById,
      cprByParticipantId,
      pointsByParticipantId,
      participationCount: sessionStats.participationCount,
    }),
    [state.participants, state.realisations, routesById, cprByParticipantId, pointsByParticipantId, sessionStats.participationCount, wallOfFameSexFilter],
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
      setConfirmationMessage("Séance enregistrée.");
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
        nom: "", prenom: "", email: "", passport: "sans", sexe: "", cotisation: false, ffme: false, canEncadrer: false, canReferer: false, canAdmin: false,
      });
      setConfirmationMessage("Participant ajouté.");
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

  async function updateMyProfile(patch) {
    if (!myParticipant || !USE_API) return;
    const previous = myParticipant;
    const optimistic = { ...previous, ...patch };
    setState((prev) => ({
      ...prev,
      participants: prev.participants.map((participant) => String(participant.id) === myParticipantId ? optimistic : participant),
    }));
    try {
      const updated = await apiFetch("/participants/me/profile", {
        method: "PATCH",
        // Le backend traite désormais PATCH comme une vraie mise à jour partielle.
        // Ne renvoyer que le patch évite de réécrire involontairement le sexe,
        // l'avatar ou la confidentialité avec une valeur locale obsolète.
        body: JSON.stringify(patch),
      });
      setState((prev) => ({
        ...prev,
        participants: prev.participants.map((participant) => String(participant.id) === myParticipantId ? updated : participant),
      }));
      setConfirmationMessage("Préférences du profil enregistrées.");
    } catch (error) {
      setState((prev) => ({
        ...prev,
        participants: prev.participants.map((participant) => String(participant.id) === myParticipantId ? previous : participant),
      }));
      setSyncMessage("Erreur d'enregistrement du profil");
      console.error(error);
    }
  }

  async function deleteParticipant(id) {
    const participant = state.participants.find((item) => String(item.id) === String(id));
    if (!participant) return;
    const relatedRealisations = state.realisations.filter(
      (item) => String(item.participantId) === String(id)
    ).length;
    const relatedInscriptions = state.sessions.reduce(
      (count, session) => count + session.participantIds.filter(
        (participantId) => String(participantId) === String(id)
      ).length,
      0
    );
    const warning = relatedInscriptions || relatedRealisations
      ? ` Cette action supprimera aussi ${relatedInscriptions} inscription(s) et ${relatedRealisations} réalisation(s).`
      : "";
    if (!window.confirm(`Supprimer définitivement le grimpeur ${fullName(participant)} ?${warning}`)) return;

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

    if (!USE_API) {
      setConfirmationMessage("Grimpeur supprimé.");
      return;
    }
    try {
      await apiFetch(`/participants/${id}`, { method: "DELETE" });
      setSyncMessage("Participant supprimé via l’API");
      setConfirmationMessage("Grimpeur supprimé.");
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
    if (!newRoute.numeroCorde || !couleurPrises || !newRoute.cotationReference || !nomOuvreur) {
      return setRouteError("Renseigne la corde, la couleur, la cotation et l’ouvreur.");
    }

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
      tags: newRoute.tags,
    };

    try {
      const savedRoute = USE_API
        ? await apiFetch("/routes", { method: "POST", body: JSON.stringify(route) })
        : route;
      setState((prev) => ({ ...prev, routes: [...prev.routes, savedRoute] }));
      setRouteError("");
      setNewRoute({
        numeroCorde: "", couleurPrises: "", cotationReference: "", nomVoie: "", nomOuvreur: "", moulinetteOnly: false, tags: [],
      });
      setConfirmationMessage("Voie ajoutée.");
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
      tags: route.tags || [],
    });
    setRouteError("");
  }

  function cancelRouteEdition() {
    setEditingRouteId("");
    setRouteEditDraft(null);
  }

  async function deleteRoute(route) {
    if (!route?.id) return;
    const relatedRealisations = state.realisations.filter(
      (item) => String(item.voieId) === String(route.id)
    ).length;
    const routeLabel = formatRouteName(route);
    const warning = relatedRealisations
      ? ` Cette action supprimera aussi ${relatedRealisations} réalisation(s).`
      : "";
    if (!window.confirm(`Supprimer définitivement la voie « ${routeLabel} » ?${warning}`)) return;

    try {
      if (USE_API) {
        await apiFetch(`/routes/${encodeURIComponent(route.id)}`, { method: "DELETE" });
      }
      setState((prev) => ({
        ...prev,
        routes: prev.routes.filter((item) => item.id !== route.id),
        realisations: prev.realisations.filter((item) => item.voieId !== route.id),
      }));
      cancelRouteEdition();
      setConfirmationMessage("Voie supprimée.");
    } catch (error) {
      setRouteError(error.message || "Suppression de la voie impossible.");
    }
  }

  async function saveRouteEdition(route) {
    if (!routeEditDraft) return;
    setRouteError("");
    const couleurPrises = routeEditDraft.couleurPrises.trim();
    const nomOuvreur = routeEditDraft.nomOuvreur.trim();
    if (!couleurPrises || !nomOuvreur) {
      setRouteError("Renseigne au moins la couleur et l’ouvreur.");
      return;
    }

    const routePatch = {
      numeroCorde: Number(routeEditDraft.numeroCorde),
      couleurPrises,
      cotationReference: routeEditDraft.cotationReference,
      cotationAjustee: routeEditDraft.cotationReference,
      nomVoie: routeEditDraft.nomVoie.trim(),
      nomOuvreur,
      moulinetteOnly: routeEditDraft.moulinetteOnly,
      tags: routeEditDraft.tags,
    };
    const updatedRoute = { ...route, ...routePatch };

    setSavingRouteId(route.id);
    try {
      const savedRoute = USE_API
        ? await apiFetch(`/routes/${encodeURIComponent(route.id)}`, {
            method: "PUT",
            body: JSON.stringify(routePatch),
          })
        : updatedRoute;
      setState((prev) => ({
        ...prev,
        routes: prev.routes.map((item) => (item.id === route.id ? savedRoute : item)),
      }));
      cancelRouteEdition();
      setSyncMessage("Voie mise à jour.");
      setConfirmationMessage("Voie modifiée.");
    } catch (error) {
      setRouteError(error.message || "Modification de la voie impossible.");
    } finally {
      setSavingRouteId("");
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

  async function syncRealisationPatch(realisationId, patch) {
    try {
      await updateRealisationInApi(realisationId, patch);
    } catch (error) {
      console.error(error);
    }
  }

  function updateRealisation(realisationId, patch) {
    const target = state.realisations.find((item) => String(item.id) === String(realisationId));
    if (!target || String(target.participantId) !== String(myParticipantId)) {
      alert("Vous pouvez modifier uniquement vos propres réalisations.");
      return;
    }
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
    requestedParticipantId = myParticipantId || "";
    const requestedParticipant = participantsById[requestedParticipantId];
    const latestRegisteredDay = requestedParticipant?.cotisation
      ? getParticipantSessionDays(state.sessions, requestedParticipantId)[0] || ""
      : "";
    const defaultParticipantId = latestRegisteredDay ? requestedParticipantId : "";

    setNewRealisation((previous) => buildRealisationDraft({
      previous,
      route,
      routeId,
      participantId: defaultParticipantId,
      selectedDay: latestRegisteredDay,
      sessionId: defaultParticipantId && latestRegisteredDay
        ? resolveSessionIdForRealisation(state.sessions, defaultParticipantId, latestRegisteredDay)
        : "",
    }));

    setRealisationModalRouteId(routeId || "");
  }

  function closeRealisationModal() {
    setRealisationModalRouteId(null);
  }


async function persistRealisationToApi(realisation) {
  if (!USE_API) return realisation;
  if (!authUser) {
    throw new Error("Connexion requise pour enregistrer une réalisation.");
  }
  return await apiFetch("/realisations", {
    method: "POST",
    body: JSON.stringify(realisation),
  });
}

async function updateRealisationInApi(realisationId, patch) {
  if (!USE_API || !authUser) return;
  await apiFetch(`/realisations/${realisationId}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

async function deleteRealisation(realisation) {
  if (!realisation?.id) return;
  if (String(realisation.participantId) !== String(myParticipantId)) {
    alert("Vous pouvez supprimer uniquement vos propres réalisations.");
    return;
  }

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
      await apiFetch(`/realisations/${encodeURIComponent(realisation.id)}`, {
        method: "DELETE",
      });
    }
    setConfirmationMessage("Réalisation supprimée.");
  } catch (error) {
    setState((prev) => ({ ...prev, realisations: previousRealisations }));
    alert(`Suppression impossible : ${error.message || error}`);
  }
}

  async function addRealisation() {
    if (!myParticipantId || String(newRealisation.participantId) !== String(myParticipantId)) {
      alert("Vous pouvez enregistrer uniquement vos propres réalisations.");
      return;
    }
    if (!newRealisation.participantId || !newRealisation.selectedDay || !newRealisation.voieId) {
      alert("Sélectionne un jour, un participant et une voie.");
      return;
    }

    const participant = participantsById[newRealisation.participantId];
    if (!participant?.cotisation) {
      alert("Le participant doit avoir payé sa cotisation pour enregistrer une réalisation.");
      return;
    }

    const sessionId = resolveSessionIdForRealisation(state.sessions, newRealisation.participantId, newRealisation.selectedDay);
    if (!sessionId) {
      alert("Le participant doit être inscrit à au moins une séance ce jour-là pour enregistrer une réalisation.");
      return;
    }

    const realisation = buildRealisationPayload({
      draft: newRealisation,
      sessionId,
      route: routesById[newRealisation.voieId],
    });

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
        rating: 0,
        chute: false,
        assureurId: "",
      }));
      setRealisationModalRouteId(null);
      setConfirmationMessage("Réalisation enregistrée.");
    } catch (error) {
      alert(String(error.message || error));
    }
  }

  async function loadAdminAccessData() {
    if (authUser?.role !== "admin") return;

    try {
      const [usersResponse, logsResponse] = await Promise.all([
        apiFetch("/admin/auth/users"),
        apiFetch("/admin/auth/logs"),
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

  if (!USE_API || !authUser) return;

  try {
    const data = await apiFetch("/auth/theme", {
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
      await apiFetch("/auth/logout", { method: "POST" });
    } catch (error) {
      console.error(error);
    } finally {
      setAuthUser(null);
      setAdminUnlocked(false);
      setGeneratedResetToken("");
      setAdminAuthUsers([]);
      setAdminAccessLogs([]);
      setPendingBroadcastMessages([]);
      setBroadcastMessageError("");
    }
  }

  async function publishBroadcastMessage({ title, body }) {
    if (!USE_API || authUser?.role !== "admin") {
      throw new Error("Connexion administrateur requise.");
    }
    return apiFetch("/admin/broadcast-messages", {
      method: "POST",
      body: JSON.stringify({ title, body }),
    });
  }

  async function acknowledgeBroadcastMessage(messageId) {
    try {
      setBroadcastMessageError("");
      await apiFetch(`/auth/broadcast-messages/${messageId}/read`, { method: "POST" });
      setPendingBroadcastMessages((messages) => messages.filter(
        (message) => String(message.id) !== String(messageId)
      ));
    } catch (error) {
      setBroadcastMessageError(String(error.message || error));
    }
  }

  async function changePassword(currentPassword, newPassword) {
    return apiFetch("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  }

  async function requestEmailChange(newEmail, currentPassword) {
    return apiFetch("/auth/change-email/request", {
      method: "POST",
      body: JSON.stringify({ newEmail, currentPassword }),
    });
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
      await apiFetch(`/admin/auth/users/${userId}/approve`, { method: "POST" });
      await loadAdminAccessData();
      setConfirmationMessage("Compte approuvé.");
    } catch (error) {
      setAuthError(String(error.message || error));
    }
  }

  async function revokeUserAccess(userId) {
    try {
      await apiFetch(`/admin/auth/users/${userId}/revoke`, {
        method: "POST",
        body: JSON.stringify({ reason: "Révocation / répudiation par administrateur" }),
      });
      await loadAdminAccessData();
    } catch (error) {
      setAuthError(String(error.message || error));
    }
  }

  async function deleteUserAccount(user) {
    if (!user?.id) return;
    if (!window.confirm(
      `Supprimer définitivement le compte de ${user.prenom} ${user.nom} (${user.email}) ? Le grimpeur associé sera conservé.`
    )) return;

    try {
      await apiFetch(`/admin/auth/users/${user.id}`, { method: "DELETE" });
      await loadAdminAccessData();
      setConfirmationMessage("Compte supprimé.");
    } catch (error) {
      setAuthError(String(error.message || error));
    }
  }

  async function reactivateUserAccess(userId) {
    try {
      await apiFetch(`/admin/auth/users/${userId}/reactivate`, { method: "POST" });
      await loadAdminAccessData();
    } catch (error) {
      setAuthError(String(error.message || error));
    }
  }

  async function generatePasswordResetToken(userId) {
    try {
      const response = await apiFetch(`/admin/auth/users/${userId}/reset-token`, { method: "POST" });
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
    // La version applicative complète la version du format d’export sans la remplacer.
    // Les anciens imports restent ainsi compatibles, tandis qu’un fichier permet
    // d’identifier immédiatement la version de CristalClimbClub qui l’a produit.
    const buildVersionedExport = (data) => ({
      ...data,
      exportedAt: data?.exportedAt || new Date().toISOString(),
      applicationVersion: APP_VERSION,
    });
    const filename = `climbcrew_export_${APP_VERSION}.json`;

    if (USE_API && authUser?.role === "admin") {
      try {
        const payload = await apiFetch("/admin/export-data");
        const versionedPayload = buildVersionedExport(payload.data || payload);
        downloadFile(filename, JSON.stringify(versionedPayload, null, 2));
        setImportMessage(`Export API version ${APP_VERSION} réussi.`);
        return;
      } catch (error) {
        console.error(error);
        setImportMessage("Export API impossible : export local utilisé.");
      }
    }

    const versionedPayload = buildVersionedExport(state);
    downloadFile(filename, JSON.stringify(versionedPayload, null, 2));
    setImportMessage(`Export local version ${APP_VERSION} réussi.`);
  }

  function exportMyRealisationsCsv() {
    if (!myParticipant) return;

    const headers = ["country", "crag", "sector", "route", "grade", "date", "style", "comment"];
    const rows = [...myRealisations]
      .sort((a, b) => a.dateRealisation.localeCompare(b.dateRealisation))
      .map((realisation) => {
        const route = routesById[realisation.voieId];
        const ropeNumber = route ? normalizeRopeNumber(route.numeroCorde) : 0;
        const routeName = route?.nomVoie?.trim() || `Voie corde ${ropeNumber}`;
        const details = [
          route?.nomOuvreur ? `Ouvreur : ${route.nomOuvreur}` : "",
          route?.couleurPrises ? `Couleur : ${route.couleurPrises}` : "",
          realisation.cotationProposee ? `Cotation proposée : ${realisation.cotationProposee}` : "",
          route?.tags?.length ? `Caractéristiques : ${route.tags.map((tag) => ROUTE_TAGS.find((item) => item.value === tag)?.label || tag).join(", ")}` : "",
          realisation.commentaire || "",
        ].filter(Boolean).join(" · ");
        return [
          "France",
          "ASTC",
          `Corde ${ropeNumber}`,
          routeName,
          route?.cotationAjustee || route?.cotationReference || "",
          realisation.dateRealisation?.slice(0, 10) || "",
          theCragStyleForRealisation(realisation, route),
          details,
        ];
      });
    const filename = `thecrag-${csvFileSlug(fullName(myParticipant))}.csv`;
    downloadFile(filename, buildCsv(headers, rows), "text/csv;charset=utf-8;");
    setConfirmationMessage("Export theCrag téléchargé.");
  }

  async function importJsonFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const importedApplicationVersion = String(
        parsed.applicationVersion || parsed.appVersion || parsed.metadata?.applicationVersion || ""
      ).trim();
      const importedVersionLabel = importedApplicationVersion
        ? ` (version source ${importedApplicationVersion})`
        : " (ancien export sans version applicative)";

      if (USE_API && authUser?.role === "admin") {
        const result = await apiFetch("/admin/import-data", {
          method: "POST",
          body: JSON.stringify({ data: parsed }),
        });
        await reloadApiState();
        setImportMessage(
          `Import API réussi${importedVersionLabel} : ${result.participantsImported || 0} participants, ${result.sessionsImported || 0} séances, ${result.routesImported || 0} voies.`
        );
      } else {
        setState((prev) => normalizeAppData(parsed, prev));
        setImportMessage(`Import JSON local réussi${importedVersionLabel}.`);
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
      <div className={`card session-card session-status-${String(session.status || "fermee").trim().toLowerCase()} ${compact ? "session-card-compact" : ""}`} key={session.id}>
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
                <Button variant="remove" onClick={() => removeParticipantFromSession(session.id, p.id)} aria-label="Retirer">×</Button>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }


  if (USE_API && authLoading) {
    return <AuthPage loading appVersion={APP_VERSION} />;
  }

  if (USE_API && !authUser) {
    return (
      <AuthPage
        authView={authView}
        authError={authError}
        authMessage={authMessage}
        loginForm={loginForm}
        setLoginForm={setLoginForm}
        requestAccessForm={requestAccessForm}
        setRequestAccessForm={setRequestAccessForm}
        forgotPasswordForm={forgotPasswordForm}
        setForgotPasswordForm={setForgotPasswordForm}
        resetPasswordForm={resetPasswordForm}
        setResetPasswordForm={setResetPasswordForm}
        handleLogin={handleLogin}
        handleRequestAccess={handleRequestAccess}
        handleForgotPassword={handleForgotPassword}
        handleResetPassword={handleResetPassword}
        setAuthView={setAuthView}
        setAuthError={setAuthError}
        setAuthMessage={setAuthMessage}
        appVersion={APP_VERSION}
      />
    );
  }


  return (
    <div className="app">
      {confirmationMessage && (
        <div className="confirmation-toast" role="status" aria-live="polite">
          {confirmationMessage}
        </div>
      )}

      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

      <AppSidebar
        open={sidebarOpen}
        visibleTabs={visibleTabs}
        activeTab={tab}
        onSelectTab={setTab}
        authUser={authUser}
        onLogout={handleLogout}
        onClose={() => setSidebarOpen(false)}
      />
      <BroadcastMessageModal
        messages={pendingBroadcastMessages}
        error={broadcastMessageError}
        onAcknowledge={acknowledgeBroadcastMessage}
      />

      <RealisationModal
        open={realisationModalRouteId !== null}
        route={realisationModalRoute}
        newRealisation={newRealisation}
        setNewRealisation={setNewRealisation}
        availableDays={modalAvailableDays}
        eligibleParticipants={modalEligibleParticipants}
        participants={alphabeticalParticipants}
        routes={state.routes}
        routesById={routesById}
        onRouteIdChange={setRealisationModalRouteId}
        onClose={closeRealisationModal}
        onSubmit={addRealisation}
      />

      <MobileBottomNav
        visibleTabs={visibleTabs}
        activeTab={tab}
        onSelectTab={setTab}
      />

      <div className="shell">
  <div className="hero">
    <div className="topbar">
      <button className="menu-button" onClick={() => setSidebarOpen(true)} aria-label="Afficher le menu">
        ☰
      </button>
      <div className="brand">
        <img src="/logo-climbcrew.png" alt="Logo CristalClimbClub" className="app-logo" />
        <div>
          <div className="brand-title-row">
            <h1>CristalClimbClub</h1>
            <span className="topbar-version" aria-label={`Version ${APP_VERSION}`}>v{APP_VERSION}</span>
          </div>
          <p>{tab === "parametres" ? "Paramètres" : (visibleTabs.find((item) => item.key === tab)?.label || "CristalClimbClub")}</p>
        </div>
      </div>
    </div>
  </div>

        {tab === "inscriptions" && (
          <Inscriptions
            viewMode={viewMode}
            setViewMode={setViewMode}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            ensureSessionsForDate={ensureSessionsForDate}
            daySessions={daySessions}
            weekSessions={weekSessions}
            renderSessionCard={renderSessionCard}
          />
        )}

        {tab === "voies" && (
          <Voies
            adminUnlocked={adminUnlocked}
            newRoute={newRoute}
            setNewRoute={setNewRoute}
            addRoute={addRoute}
            routeError={routeError}
            routeDisplayGroups={routeDisplayGroups}
            routeSortMode={routeSortMode}
            setRouteSortMode={setRouteSortMode}
            routeRatingsById={routeRatingsById}
            routeAggregatesById={routeAggregatesById}
            openRealisationModal={openRealisationModal}
            selectedParticipantProgress={state.selectedParticipantProgress}
            editingRouteId={editingRouteId}
            routeEditDraft={routeEditDraft}
            setRouteEditDraft={setRouteEditDraft}
            startRouteEdition={startRouteEdition}
            saveRouteEdition={saveRouteEdition}
            cancelRouteEdition={cancelRouteEdition}
            deleteRoute={deleteRoute}
            savingRouteId={savingRouteId}
          />
        )}

        {tab === "progression" && (
          <Progression
            selectedParticipantProgress={state.selectedParticipantProgress}
            selectedParticipant={participantsById[state.selectedParticipantProgress] || null}
            setState={setState}
            selectedRouteProgress={selectedRouteProgress}
            setSelectedRouteProgress={setSelectedRouteProgress}
            alphabeticalParticipants={alphabeticalParticipants}
            routes={state.routes}
            routesById={routesById}
            openRealisationModal={openRealisationModal}
            participantProgressStats={participantProgressStats}
            pointsByParticipantId={pointsByParticipantId}
            selectedParticipantRealisations={selectedParticipantRealisations}
            progressViewRealisations={progressViewRealisations}
            participantsById={participantsById}
            getParticipantSessions={getParticipantSessions}
            cprByParticipantId={cprByParticipantId}
            deleteRealisation={deleteRealisation}
            updateRealisation={updateRealisation}
            routeAggregatesById={routeAggregatesById}
            expandedRealisationIds={expandedRealisationIds}
            setRealisationExpanded={setRealisationExpanded}
            allProgressRealisationsExpanded={allProgressRealisationsExpanded}
            toggleAllProgressRealisations={toggleAllProgressRealisations}
            allRealisations={state.realisations}
            myParticipantId={myParticipantId}
          />
        )}

        {tab === "mon_profil" && (
          <Profil
            USE_API={USE_API}
            authUser={authUser}
            myParticipant={myParticipant}
            myParticipantId={myParticipantId}
            myRealisations={myRealisations}
            allRealisations={state.realisations}
            myProfileStats={myProfileStats}
            cprByParticipantId={cprByParticipantId}
            pointsByParticipantId={pointsByParticipantId}
            sessionStats={sessionStats}
            routesById={routesById}
            getParticipantSessions={getParticipantSessions}
            getPassportStyle={getPassportStyle}
            getPassportDotStyle={getPassportDotStyle}
            normalizePassport={normalizePassport}
            updateMyProfile={updateMyProfile}
            exportMyRealisationsCsv={exportMyRealisationsCsv}
          />
        )}

        {tab === "parametres" && (
          <Parametres
            USE_API={USE_API}
            authUser={authUser}
            changePassword={changePassword}
            requestEmailChange={requestEmailChange}
            themePreference={themePreference}
            onThemePreferenceChange={handleThemePreferenceChange}
            themeOptions={THEME_OPTIONS}
          />
        )}

        {tab === "administration" && (
          <Administration
            adminUnlocked={adminUnlocked}
            adminInput={adminInput}
            setAdminInput={setAdminInput}
            unlockAdmin={unlockAdmin}
            adminError={adminError}
            newParticipant={newParticipant}
            setNewParticipant={setNewParticipant}
            addParticipant={addParticipant}
            adminParticipants={adminParticipants}
            updateParticipant={updateParticipant}
            deleteParticipant={deleteParticipant}
            exportAllData={exportAllData}
            importJsonFile={importJsonFile}
            importMessage={importMessage}
            publishBroadcastMessage={publishBroadcastMessage}
          />
        )}

        {tab === "gestion_comptes" && (
          <GestionComptes
            USE_API={USE_API}
            canManageAccountsAndLogs={canManageAccountsAndLogs}
            loadAdminAccessData={loadAdminAccessData}
            generatedResetToken={generatedResetToken}
            adminAuthUsers={adminAuthUsers}
            approveAccessRequest={approveAccessRequest}
            revokeUserAccess={revokeUserAccess}
            reactivateUserAccess={reactivateUserAccess}
            generatePasswordResetToken={generatePasswordResetToken}
            deleteUserAccount={deleteUserAccount}
            authUser={authUser}
          />
        )}

        {tab === "logs" && (
          <Logs
            USE_API={USE_API}
            canManageAccountsAndLogs={canManageAccountsAndLogs}
            adminAccessLogs={adminAccessLogs}
          />
        )}

        {tab === "statistiques" && (
          <Statistiques
            sessionStats={sessionStats}
            topRouteRankings={topRouteRankings}
            leadRealisationStats={leadRealisationStats}
            formatRouteName={formatRouteName}
            statsSortField={statsSortField}
            setStatsSortField={setStatsSortField}
            statsSortDirection={statsSortDirection}
            setStatsSortDirection={setStatsSortDirection}
            sortedStatsParticipants={sortedStatsParticipants}
            getPassportStyle={getPassportStyle}
            getPassportDotStyle={getPassportDotStyle}
            normalizePassport={normalizePassport}
            cprByParticipantId={cprByParticipantId}
            formatPoints={formatPoints}
            pointsByParticipantId={pointsByParticipantId}
          />
        )}

        {tab === "wall_of_fame" && (
          <WallOfFame
            wallOfFameCategories={wallOfFameCategories}
            getPassportStyle={getPassportStyle}
            getPassportDotStyle={getPassportDotStyle}
            normalizePassport={normalizePassport}
            wallOfFameSexFilter={wallOfFameSexFilter}
            setWallOfFameSexFilter={setWallOfFameSexFilter}
          />
        )}

        {tab === "faq" && (
          <FaqSection APP_VERSION={APP_VERSION} canAccessAdminTabs={canAccessAdminTabs} USE_API={USE_API} authUser={authUser} />
        )}



</div>
</div>
  );
}

export default App;