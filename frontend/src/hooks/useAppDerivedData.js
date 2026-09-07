import { useMemo } from "react";

import {
  calculateLeadPoints,
  calculateLeadRealisationStats,
  calculateRouteAggregates,
  calculateSimpleCpr,
  calculateWallOfFameCategories,
  defaultSessionStatus,
  fullName,
  gradeToIndex,
  isSuccessfulLeadRealisation,
  todayIso,
} from "../lib/domain.js";
import { buildRouteDisplayGroups } from "../lib/route-display-groups.js";
import { getParticipantSessionDays, isManagedSession } from "../lib/realisation-workflow.js";

export function buildSessionStats({ sessions, participants, realisations, routes }) {
  const unique = new Set(sessions.flatMap((session) => session.participantIds));
  const participationCount = {};
  sessions.forEach((session) => {
    session.participantIds.forEach((id) => {
      participationCount[id] = (participationCount[id] || 0) + 1;
    });
  });
  return {
    nombreInscrits: unique.size,
    nombreCotisations: participants.filter((participant) => participant.cotisation).length,
    nombreFFME: participants.filter((participant) => participant.ffme).length,
    nombreRealisations: realisations.length,
    nombreVoiesActives: routes.filter((route) => route.active).length,
    participationCount,
    sortedParticipants: [...participants].sort((a, b) => fullName(a).localeCompare(fullName(b), "fr")),
  };
}

export function buildRouteRatings(realisations) {
  const ratings = {};
  realisations.forEach((realisation) => {
    const rating = Number(realisation.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return;
    const current = ratings[realisation.voieId] || { total: 0, count: 0, average: 0 };
    current.total += rating;
    current.count += 1;
    current.average = current.total / current.count;
    ratings[realisation.voieId] = current;
  });
  return ratings;
}

export function buildTopRouteRankings(routes, realisations, routeRatingsById) {
  const entries = routes.map((route) => {
    const routeRealisations = realisations.filter((item) => item.voieId === route.id);
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
}

export function useAppDerivedData({
  state,
  authUser,
  newRealisation,
  realisationModalRouteId,
  selectedRouteProgress,
  expandedRealisationIds,
  routeSortMode,
  statsSortField,
  statsSortDirection,
  wallOfFameSexFilter,
  recentlyAddedParticipantIds,
}) {
  const participantsById = useMemo(
    () => Object.fromEntries(state.participants.map((participant) => [participant.id, participant])),
    [state.participants],
  );
  const routesById = useMemo(
    () => Object.fromEntries(state.routes.map((route) => [route.id, route])),
    [state.routes],
  );
  const routeDisplayGroups = useMemo(
    () => buildRouteDisplayGroups({ routes: state.routes, ropes: state.ropes, sortMode: routeSortMode }),
    [routeSortMode, state.routes, state.ropes],
  );
  const sessionsById = useMemo(
    () => Object.fromEntries(state.sessions.map((session) => [session.id, session])),
    [state.sessions],
  );
  const realisationModalRoute = realisationModalRouteId ? routesById[realisationModalRouteId] : null;

  const sortedSessionsByDate = useMemo(() => [...state.sessions].sort((a, b) => {
    const dateCompare = b.date.localeCompare(a.date);
    return dateCompare !== 0 ? dateCompare : a.slot.localeCompare(b.slot);
  }), [state.sessions]);

  const modalAllAvailableDays = useMemo(() => [...new Set(
    sortedSessionsByDate.filter(isManagedSession).map((session) => session.date),
  )], [sortedSessionsByDate]);

  const modalAllEligibleParticipants = useMemo(() => [...state.participants]
    .filter((participant) => Boolean(participant.cotisation))
    .filter((participant) => getParticipantSessionDays(state.sessions, participant.id).length > 0)
    .sort((a, b) => fullName(a).localeCompare(fullName(b), "fr")), [state.participants, state.sessions]);

  const modalAvailableDays = useMemo(() => (
    newRealisation.participantId
      ? getParticipantSessionDays(state.sessions, newRealisation.participantId)
      : modalAllAvailableDays
  ), [newRealisation.participantId, modalAllAvailableDays, state.sessions]);

  const modalEligibleParticipants = useMemo(() => {
    if (!newRealisation.selectedDay) return modalAllEligibleParticipants;
    const participantIdsForSelectedDay = new Set(
      state.sessions
        .filter((session) => session.date === newRealisation.selectedDay)
        .filter(isManagedSession)
        .flatMap((session) => session.participantIds || []),
    );
    return modalAllEligibleParticipants.filter((participant) => participantIdsForSelectedDay.has(participant.id));
  }, [newRealisation.selectedDay, modalAllEligibleParticipants, state.sessions]);

  const selectedDate = state.selectedDate || todayIso();
  const daySessions = useMemo(() => ["midi", "soir", "matin"].map((slot) => {
    const found = state.sessions.find((session) => session.date === selectedDate && session.slot === slot);
    return found || {
      id: `${selectedDate}-${slot}`,
      date: selectedDate,
      slot,
      status: defaultSessionStatus(selectedDate, slot),
      encadrantId: null,
      referentId: null,
      participantIds: [],
    };
  }), [selectedDate, state.sessions]);

  const weekDates = useMemo(() => {
    const current = new Date(`${selectedDate}T12:00:00`);
    const day = current.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(current);
    monday.setDate(current.getDate() + diff);
    return Array.from({ length: 5 }, (_, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      return date.toISOString().slice(0, 10);
    });
  }, [selectedDate]);

  const weekSessions = useMemo(() => weekDates.map((date) => ({
    date,
    sessions: ["midi", "soir", "matin"].map((slot) => {
      const found = state.sessions.find((session) => session.date === date && session.slot === slot);
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
  })), [weekDates, state.sessions]);

  const selectedParticipantRealisations = useMemo(() => state.realisations
    .filter((realisation) => realisation.participantId === state.selectedParticipantProgress)
    .sort((a, b) => a.dateRealisation.localeCompare(b.dateRealisation)), [state.realisations, state.selectedParticipantProgress]);

  const participantProgressStats = useMemo(() => {
    const gradesAll = selectedParticipantRealisations
      .map((realisation) => routesById[realisation.voieId]?.cotationAjustee)
      .filter(Boolean);
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

  const sessionStats = useMemo(() => buildSessionStats({
    sessions: state.sessions,
    participants: state.participants,
    realisations: state.realisations,
    routes: state.routes,
  }), [state.sessions, state.participants, state.realisations, state.routes]);
  const alphabeticalParticipants = useMemo(
    () => [...state.participants].sort((a, b) => fullName(a).localeCompare(fullName(b), "fr")),
    [state.participants],
  );
  const cprByParticipantId = useMemo(() => Object.fromEntries(
    state.participants.map((participant) => [
      participant.id,
      calculateSimpleCpr(
        state.realisations.filter((realisation) => String(realisation.participantId) === String(participant.id)),
        routesById,
      ),
    ]),
  ), [state.participants, state.realisations, routesById]);
  const pointsByParticipantId = useMemo(
    () => calculateLeadPoints(state.participants, state.routes, state.realisations),
    [state.participants, state.routes, state.realisations],
  );

  const myParticipantId = authUser?.participantId ? String(authUser.participantId) : "";
  const myParticipant = participantsById[myParticipantId] || null;
  const myRealisations = useMemo(() => {
    if (!myParticipantId) return [];
    return state.realisations
      .filter((realisation) => String(realisation.participantId) === myParticipantId)
      .sort((a, b) => b.dateRealisation.localeCompare(a.dateRealisation));
  }, [state.realisations, myParticipantId]);
  const myProfileStats = useMemo(() => {
    const gradesAll = myRealisations.map((realisation) => routesById[realisation.voieId]?.cotationAjustee).filter(Boolean);
    const bestAll = gradesAll.length
      ? gradesAll.reduce((best, current) => (gradeToIndex(current) > gradeToIndex(best) ? current : best))
      : null;
    return { count: myRealisations.length, bestAll };
  }, [myRealisations, routesById]);

  const sortedStatsParticipants = useMemo(() => {
    const direction = statsSortDirection === "asc" ? 1 : -1;
    return [...state.participants].sort((a, b) => {
      if (statsSortField === "name") return fullName(a).localeCompare(fullName(b), "fr") * direction;
      if (statsSortField === "passport") return (a.passport || "").localeCompare(b.passport || "", "fr") * direction;
      if (statsSortField === "cotisation") return ((a.cotisation ? 1 : 0) - (b.cotisation ? 1 : 0)) * direction;
      if (statsSortField === "ffme") return ((a.ffme ? 1 : 0) - (b.ffme ? 1 : 0)) * direction;
      if (statsSortField === "cpr") {
        const left = cprByParticipantId[a.id]?.averageIndex;
        const right = cprByParticipantId[b.id]?.averageIndex;
        return ((Number.isFinite(left) ? left : -1) - (Number.isFinite(right) ? right : -1)) * direction;
      }
      if (statsSortField === "points") return ((pointsByParticipantId[a.id] || 0) - (pointsByParticipantId[b.id] || 0)) * direction;
      if (statsSortField === "participations") return ((sessionStats.participationCount[a.id] || 0) - (sessionStats.participationCount[b.id] || 0)) * direction;
      return fullName(a).localeCompare(fullName(b), "fr") * direction;
    });
  }, [state.participants, sessionStats.participationCount, cprByParticipantId, pointsByParticipantId, statsSortField, statsSortDirection]);

  const adminParticipants = useMemo(() => {
    const recentSet = new Set(recentlyAddedParticipantIds.map(String));
    const recentParticipants = recentlyAddedParticipantIds
      .map((id) => state.participants.find((participant) => String(participant.id) === String(id)))
      .filter(Boolean);
    const alphabeticalOthers = state.participants
      .filter((participant) => !recentSet.has(String(participant.id)))
      .sort((a, b) => fullName(a).localeCompare(fullName(b), "fr"));
    return [...recentParticipants, ...alphabeticalOthers];
  }, [state.participants, recentlyAddedParticipantIds]);

  const routeAggregatesById = useMemo(
    () => calculateRouteAggregates(state.routes, state.realisations, cprByParticipantId),
    [state.routes, state.realisations, cprByParticipantId],
  );
  const leadRealisationStats = useMemo(
    () => calculateLeadRealisationStats(state.routes, state.realisations, routesById),
    [state.routes, state.realisations, routesById],
  );
  const routeRatingsById = useMemo(() => buildRouteRatings(state.realisations), [state.realisations]);
  const topRouteRankings = useMemo(
    () => buildTopRouteRankings(state.routes, state.realisations, routeRatingsById),
    [state.routes, state.realisations, routeRatingsById],
  );
  const wallOfFameCategories = useMemo(() => calculateWallOfFameCategories({
    participants: state.participants.filter((participant) => (
      wallOfFameSexFilter === "all" || participant.sexe === wallOfFameSexFilter
    )),
    realisations: state.realisations,
    routesById,
    cprByParticipantId,
    pointsByParticipantId,
    participationCount: sessionStats.participationCount,
  }), [state.participants, state.realisations, routesById, cprByParticipantId, pointsByParticipantId, sessionStats.participationCount, wallOfFameSexFilter]);

  return {
    participantsById,
    routesById,
    routeDisplayGroups,
    sessionsById,
    realisationModalRoute,
    modalAllAvailableDays,
    modalAllEligibleParticipants,
    modalAvailableDays,
    modalEligibleParticipants,
    selectedDate,
    daySessions,
    weekDates,
    weekSessions,
    selectedParticipantRealisations,
    participantProgressStats,
    selectedRouteRealisations,
    progressViewRealisations,
    allProgressRealisationsExpanded,
    sessionStats,
    alphabeticalParticipants,
    cprByParticipantId,
    pointsByParticipantId,
    myParticipantId,
    myParticipant,
    myRealisations,
    myProfileStats,
    sortedStatsParticipants,
    adminParticipants,
    routeAggregatesById,
    leadRealisationStats,
    routeRatingsById,
    topRouteRankings,
    wallOfFameCategories,
  };
}
