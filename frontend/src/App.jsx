import React, { useEffect, useMemo } from "react";

import Button from "./components/Button.jsx";
import AuthPage from "./components/AuthPage.jsx";
import AppSidebar from "./components/AppSidebar.jsx";
import MobileBottomNav from "./components/MobileBottomNav.jsx";
import BroadcastMessageModal from "./components/BroadcastMessageModal.jsx";
import RealisationModal from "./components/RealisationModal.jsx";
import SessionCard from "./components/SessionCard.jsx";
import ConfirmDialog from "./components/ConfirmDialog.jsx";
import FaqSection from "./sections/FaqSection.jsx";
import Inscriptions from "./pages/Inscriptions.jsx";
import Voies from "./pages/Voies.jsx";
import Progression from "./pages/Progression.jsx";
import Profil from "./pages/Profil.jsx";
import Chat from "./pages/Chat.jsx";
import Parametres from "./pages/Parametres.jsx";
import Administration from "./pages/Administration.jsx";
import GestionComptes from "./pages/GestionComptes.jsx";
import DonneesUtilisateurs from "./pages/DonneesUtilisateurs.jsx";
import Logs from "./pages/Logs.jsx";
import Statistiques from "./pages/Statistiques.jsx";
import WallOfFame from "./pages/WallOfFame.jsx";

import { THEME_OPTIONS, THEME_PREFERENCE_KEY, resolveThemePreference } from "./lib/theme.js";
import { ROPE_NUMBERS, ROUTE_COLORS, STYLE_LABELS, TABS } from "./lib/ui-config.js";
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
  sortParticipantsCurrentUserFirst,
} from "./lib/domain.js";
import { USE_API, apiFetch, downloadFile } from "./lib/api.js";
import { createAuthSessionActions } from "./lib/auth-session-actions.js";
import { normalizeAppData } from "./lib/normalize.js";
import { APP_VERSION } from "./lib/version.js";
import { EMPTY_APP_DATA, useAppBusinessState } from "./hooks/useAppBusinessState.js";
import { useAppUiState } from "./hooks/useAppUiState.js";
import { useAuthState } from "./hooks/useAuthState.js";
import { useAppBootstrap } from "./hooks/useAppBootstrap.js";
import { useParticipantEditorState } from "./hooks/useParticipantEditorState.js";
import { useRouteEditorState } from "./hooks/useRouteEditorState.js";
import { useRouteManagement } from "./hooks/useRouteManagement.js";
import { useParticipantManagement } from "./hooks/useParticipantManagement.js";
import { useRealisationEditorState } from "./hooks/useRealisationEditorState.js";
import { PASSWORD_RULE_TEXT, isStrongPassword } from "./lib/password-policy.js";
import { buildRouteDisplayGroups } from "./lib/route-display-groups.js";
import { buildTheCragExport } from "./lib/thecrag.js";
import { usePlanningSessions } from "./lib/planning-view.js";
import { useBuddyAvailability } from "./hooks/useBuddyAvailability.js";
import { useSessionPersistence } from "./hooks/useSessionPersistence.js";
import { useRealisationPersistence } from "./hooks/useRealisationPersistence.js";
import { useConfirmationDialog } from "./hooks/useConfirmationDialog.js";
import {
  buildRealisationDraft,
  buildRealisationPayload,
  getParticipantSessionDays,
  getSessionAttendanceIds,
  isManagedSession,
  resolveSessionIdForRealisation,
} from "./lib/realisation-workflow.js";
import { normalizeSessionRoles } from "../../shared/session-rules.js";

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
    syncMessage, setSyncMessage,
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
    realisationSaving, setRealisationSaving,
  } = useRealisationEditorState({ defaultRouteId: EMPTY_APP_DATA.routes?.[0]?.id || "" });
  const {
    pendingConfirmation,
    setPendingConfirmation,
    requestConfirmation,
    runPendingConfirmation,
  } = useConfirmationDialog();

  useEffect(() => {
    if (!confirmationMessage) return undefined;
    const timeoutId = window.setTimeout(() => setConfirmationMessage(""), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [confirmationMessage]);

  useEffect(() => {
    if (!syncMessage) return undefined;
    const timeoutId = window.setTimeout(() => setSyncMessage(""), 4500);
    return () => window.clearTimeout(timeoutId);
  }, [syncMessage]);

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
  const buddyPreferencesByParticipantId = useBuddyAvailability({
    useApi: USE_API,
    authUser,
    active: tab === "inscriptions",
  });

  useEffect(() => {
    if (tab === "parametres") return;
    if (visibleTabs.some((item) => item.key === tab)) return;
    setTab("inscriptions");
  }, [tab, visibleTabs]);

  useEffect(() => {
    if (canManageAccountsAndLogs && ["administration", "gestion_comptes", "logs", "statistiques"].includes(tab)) {
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
    return sortParticipantsCurrentUserFirst(
      state.participants
        .filter((participant) => Boolean(participant.cotisation))
        .filter((participant) => getParticipantSessionDays(state.sessions, participant.id).length > 0),
      authUser?.participantId
    );
  }, [state.participants, state.sessions, authUser?.participantId]);

  const modalAvailableDays = useMemo(() => {
    const today = todayIso();
    const days = newRealisation.participantId
      ? getParticipantSessionDays(state.sessions, newRealisation.participantId)
      : modalAllAvailableDays;

    return days
      .filter((day) => day <= today)
      .sort((a, b) => b.localeCompare(a))
      .slice(0, 5);
  }, [newRealisation.participantId, modalAllAvailableDays, state.sessions]);

  const modalEligibleParticipants = useMemo(() => {
    if (!newRealisation.selectedDay) return modalAllEligibleParticipants;

    const participantIdsForSelectedDay = new Set(
      state.sessions
        .filter((session) => session.date === newRealisation.selectedDay)
        .filter(isManagedSession)
        .flatMap((session) => getSessionAttendanceIds(session))
    );

    return modalAllEligibleParticipants.filter((participant) => participantIdsForSelectedDay.has(String(participant.id)));
  }, [newRealisation.selectedDay, modalAllEligibleParticipants, state.sessions]);

  const { selectedDate, daySessions, weekSessions } = usePlanningSessions(state);
  const {
    addRoute,
    startRouteEdition,
    cancelRouteEdition,
    deleteRoute,
    saveRouteEdition,
  } = useRouteManagement({
    useApi: USE_API,
    state,
    setState,
    selectedDate,
    newRoute,
    setNewRoute,
    routeEditDraft,
    setRouteEditDraft,
    setEditingRouteId,
    setSavingRouteId,
    setRouteError,
    setSyncMessage,
    setConfirmationMessage,
    requestConfirmation,
  });


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
    const unique = new Set(state.sessions.flatMap((session) => getSessionAttendanceIds(session)));
    const participationCount = {};
    state.sessions.forEach((session) => {
      getSessionAttendanceIds(session).forEach((id) => {
        participationCount[id] = (participationCount[id] || 0) + 1;
      });
    });
    return {
      nombreInscrits: unique.size,
      nombreComptesActifs: adminAuthUsers.filter((user) => user.status === "active").length,
      nombreCotisations: state.participants.filter((p) => p.cotisation).length,
      nombreFFME: state.participants.filter((p) => p.ffme).length,
      nombreRealisations: state.realisations.length,
      nombreVoiesActives: state.routes.filter((r) => r.active).length,
      participationCount,
      sortedParticipants: [...state.participants].sort((a, b) => fullName(a).localeCompare(fullName(b), "fr")),
    };
  }, [state, adminAuthUsers]);

  const alphabeticalParticipants = useMemo(() => {
    return sortParticipantsCurrentUserFirst(state.participants, authUser?.participantId);
  }, [state.participants, authUser?.participantId]);

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

  const {
    addParticipant,
    updateParticipant,
    updateMyProfile,
    deleteParticipant,
    getParticipantSessions,
  } = useParticipantManagement({
    useApi: USE_API,
    state,
    setState,
    newParticipant,
    setNewParticipant,
    myParticipant,
    myParticipantId,
    setIsSyncing,
    setRecentlyAddedParticipantIds,
    setSyncMessage,
    setConfirmationMessage,
    requestConfirmation,
  });


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

  const { syncSessionToApi, persistSessionChange } = useSessionPersistence({
    useApi: USE_API,
    setState,
    onSuccess: setConfirmationMessage,
    onError: setSyncMessage,
  });

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

    // Les créneaux absents restent des placeholders locaux tant qu'aucune action
    // explicite ne les ouvre. Cela évite de réserver la simple navigation aux
    // administrateurs et laisse le backend appliquer les droits métier au moment
    // de la première modification (référent => libre, encadrant => libre/encadrée).
    if (!USE_API) {
      createdSessions.forEach((session) => syncSessionToApi(session));
    }
  }

  function updateSession(sessionId, patch) {
    const existingSession = state.sessions.find((session) => session.id === sessionId);
    const currentSession = existingSession || buildDefaultSession(sessionId);
    const patchedSession = normalizeSessionRoles({ ...currentSession, ...patch });
    const updatedSession = {
      ...patchedSession,
      participantIds: [...new Set((patchedSession.participantIds || []).map(String))],
    };

    persistSessionChange(sessionId, currentSession, updatedSession, Boolean(existingSession));
  }

  function addParticipantToSession(sessionId, participantId) {
    const requestedId = String(participantId || "");
    if (!requestedId) return;

    const existingSession = state.sessions.find((session) => session.id === sessionId);
    const currentSession = existingSession || buildDefaultSession(sessionId);
    const currentParticipantIds = currentSession.participantIds.map(String);
    const currentAttendanceIds = getSessionAttendanceIds(currentSession);
    if (currentAttendanceIds.length >= MAX_PARTICIPANTS || currentAttendanceIds.includes(requestedId)) return;

    persistSessionChange(sessionId, currentSession, {
      ...currentSession,
      participantIds: [...currentParticipantIds, requestedId],
    }, Boolean(existingSession));
  }

  function removeParticipantFromSession(sessionId, participantId) {
    const existingSession = state.sessions.find((session) => session.id === sessionId);
    const currentSession = existingSession || buildDefaultSession(sessionId);
    const removedId = String(participantId);

    persistSessionChange(sessionId, currentSession, {
      ...currentSession,
      participantIds: currentSession.participantIds.filter((id) => String(id) !== removedId),
    }, Boolean(existingSession));
  }


  const updateRealisation = useRealisationPersistence({
    useApi: USE_API,
    authUser,
    state,
    setState,
    myParticipantId,
    sessionsById,
    onSuccess: setConfirmationMessage,
    onError: setSyncMessage,
  });

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

async function deleteRealisation(realisation) {
  if (!realisation?.id) return;
  if (String(realisation.participantId) !== String(myParticipantId)) {
    setSyncMessage("Erreur : vous pouvez supprimer uniquement vos propres réalisations.");
    return;
  }

  const route = routesById[realisation.voieId];
  const routeLabel = route ? formatRouteName(route) : "la voie concernée";
  const dateLabel = realisation.dateRealisation
    ? formatDateShortFr(realisation.dateRealisation.slice(0, 10))
    : "date inconnue";

  requestConfirmation({
    title: "Supprimer la réalisation",
    message: `Supprimer définitivement la réalisation « ${routeLabel} » du ${dateLabel} ?`,
    onConfirm: async () => {
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
        setSyncMessage(`Erreur : suppression impossible : ${error.message || error}`);
      }
    },
  });
}

  async function addRealisation() {
    if (realisationSaving) return;
    if (!myParticipantId || String(newRealisation.participantId) !== String(myParticipantId)) {
      setSyncMessage("Erreur : vous pouvez enregistrer uniquement vos propres réalisations.");
      return;
    }
    if (!newRealisation.participantId || !newRealisation.selectedDay || !newRealisation.voieId) {
      setSyncMessage("Erreur : sélectionnez un jour et une voie.");
      return;
    }

    const participant = participantsById[newRealisation.participantId];
    if (!participant?.cotisation) {
      setSyncMessage("Erreur : votre cotisation doit être à jour pour enregistrer une réalisation.");
      return;
    }

    const sessionId = resolveSessionIdForRealisation(state.sessions, newRealisation.participantId, newRealisation.selectedDay);
    if (!sessionId) {
      setSyncMessage("Erreur : vous devez participer à au moins une séance ce jour-là pour enregistrer une réalisation.");
      return;
    }

    const realisation = buildRealisationPayload({
      draft: newRealisation,
      sessionId,
      route: routesById[newRealisation.voieId],
    });

    setRealisationSaving(true);
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
      setSyncMessage(`Erreur : ${String(error.message || error)}`);
    } finally {
      setRealisationSaving(false);
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

  const { handleLogin, handleLogout } = createAuthSessionActions({
    loginForm,
    reloadApiState,
    setAuthError,
    setAuthMessage,
    setAuthUser,
    setThemePreference,
    setAdminUnlocked,
    setAuthView,
    setGeneratedResetToken,
    setAdminAuthUsers,
    setAdminAccessLogs,
    setPendingBroadcastMessages,
    setBroadcastMessageError,
    setSyncMessage,
  });

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

    requestConfirmation({
      title: "Supprimer le compte",
      message: `Supprimer définitivement le compte de ${user.prenom} ${user.nom} (${user.email}) ? Le grimpeur associé sera conservé.`,
      onConfirm: async () => {
        try {
          await apiFetch(`/admin/auth/users/${user.id}`, { method: "DELETE" });
          await loadAdminAccessData();
          setConfirmationMessage("Compte supprimé.");
        } catch (error) {
          setAuthError(String(error.message || error));
        }
      },
    });
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

  function exportMyRealisationsCsv(startDate = "") {
    if (!myParticipant) return;
    try {
      const exported = buildTheCragExport({
        participant: myParticipant,
        realisations: myRealisations,
        routesById,
        startDate,
      });
      downloadFile(exported.filename, exported.csv, "text/csv;charset=utf-8;");
      setConfirmationMessage(`${exported.count} réalisation(s) exportée(s) vers theCrag depuis le ${exported.startDate}.`);
    } catch (error) {
      setConfirmationMessage(String(error.message || error));
    }
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
    return (
      <SessionCard
        key={session.id}
        session={session}
        compact={compact}
        participants={state.participants}
        participantsById={participantsById}
        alphabeticalParticipants={alphabeticalParticipants}
        currentParticipantId={authUser?.participantId}
        isAdmin={authUser?.role === "admin"}
        preferencesByParticipantId={buddyPreferencesByParticipantId}
        onUpdate={updateSession}
        onAddParticipant={addParticipantToSession}
        onRemoveParticipant={removeParticipantFromSession}
      />
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
      {syncMessage && syncMessage.startsWith("Erreur") && (
        <div className="confirmation-toast error-toast" role="alert" aria-live="assertive">
          {syncMessage}
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
      <ConfirmDialog
        open={Boolean(pendingConfirmation)}
        title={pendingConfirmation?.title}
        message={pendingConfirmation?.message}
        confirmLabel={pendingConfirmation?.confirmLabel}
        busy={Boolean(pendingConfirmation?.busy)}
        onConfirm={() => void runPendingConfirmation()}
        onCancel={() => setPendingConfirmation(null)}
      />

      <RealisationModal
        open={realisationModalRouteId !== null}
        route={realisationModalRoute}
        newRealisation={newRealisation}
        setNewRealisation={setNewRealisation}
        availableDays={modalAvailableDays}
        eligibleParticipants={modalEligibleParticipants}
        participants={alphabeticalParticipants}
        routes={state.routes.filter((route) => route.active !== false)}
        routesById={routesById}
        onRouteIdChange={setRealisationModalRouteId}
        onClose={closeRealisationModal}
        onSubmit={addRealisation}
        saving={realisationSaving}
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
            participants={state.participants}
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
            onKudosChanged={() => reloadApiState({ isMounted: () => true })}
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
            onTheCragImported={() => reloadApiState({ isMounted: () => true })}
            onRealisationsChanged={() => reloadApiState({ isMounted: () => true })}
          />
        )}

        {tab === "chat" && (
          <Chat
            myParticipantId={myParticipantId}
            participants={state.participants}
            canPin={authUser?.role === "admin"}
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
            publishBroadcastMessage={publishBroadcastMessage}
          />
        )}

        {tab === "donnees_utilisateurs" && <DonneesUtilisateurs participants={adminParticipants} sessions={state.sessions} onSaved={reloadApiState} newParticipant={newParticipant} setNewParticipant={setNewParticipant} addParticipant={addParticipant} />}

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
            onRefreshLogs={loadAdminAccessData}
            exportAllData={exportAllData}
            importJsonFile={importJsonFile}
            importMessage={importMessage}
          />
        )}

        {tab === "statistiques" && (
          <Statistiques
            sessionStats={sessionStats}
            topRouteRankings={topRouteRankings}
            leadRealisationStats={leadRealisationStats}
            routes={state.routes}
            sessions={state.sessions}
            realisations={state.realisations}
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