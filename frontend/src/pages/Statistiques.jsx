import React, { useEffect, useState } from "react";
import StatisticsSection from "../sections/StatisticsSection.jsx";
import WallOfFameSection from "../sections/WallOfFameSection.jsx";
import { USE_API, apiFetch } from "../lib/api.js";

const STORAGE_KEY = "climbcrew_local_data_v2";

function readStoredSessions() {
  if (typeof window === "undefined") return [];
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    return Array.isArray(stored.sessions) ? stored.sessions : [];
  } catch {
    return [];
  }
}

export default function Statistiques({
  sessionStats,
  topRouteRankings,
  leadRealisationStats,
  formatRouteName,
  statsSortField,
  setStatsSortField,
  statsSortDirection,
  setStatsSortDirection,
  sortedStatsParticipants,
  getPassportStyle,
  getPassportDotStyle,
  normalizePassport,
  cprByParticipantId,
  formatPoints,
  pointsByParticipantId,
  wallOfFameCategories,
  wallOfFameSexFilter,
  setWallOfFameSexFilter,
}) {
  const [statisticsSessions, setStatisticsSessions] = useState(() => readStoredSessions());

  useEffect(() => {
    if (!USE_API) {
      setStatisticsSessions(readStoredSessions());
      return undefined;
    }

    let mounted = true;
    apiFetch("/sessions")
      .then((sessions) => {
        if (mounted && Array.isArray(sessions)) setStatisticsSessions(sessions);
      })
      .catch(() => {
        if (mounted) setStatisticsSessions(readStoredSessions());
      });

    return () => {
      mounted = false;
    };
  }, []);

  const passportCounts = sortedStatsParticipants.reduce((counts, participant) => {
    const passport = normalizePassport(participant.passport) || "sans";
    counts[passport] = (counts[passport] || 0) + 1;
    return counts;
  }, {});

  const freeSessions = statisticsSessions.filter((session) => session.status === "libre");
  const supervisedSessions = statisticsSessions.filter((session) => session.status === "encadree");
  const freeAndSupervisedParticipations = [...freeSessions, ...supervisedSessions].reduce(
    (total, session) => total + (Array.isArray(session.participantIds) ? session.participantIds.length : 0),
    0,
  );

  const extendedSessionStats = {
    ...sessionStats,
    passportCounts,
    nombreSeancesLibres: freeSessions.length,
    nombreSeancesEncadrees: supervisedSessions.length,
    nombreParticipationsLibreEncadree: freeAndSupervisedParticipations,
  };

  return (
    <>
    <StatisticsSection
      sessionStats={extendedSessionStats}
      topRouteRankings={topRouteRankings}
      leadRealisationStats={leadRealisationStats}
      formatRouteName={formatRouteName}
      statsSortField={statsSortField}
      setStatsSortField={setStatsSortField}
      statsSortDirection={statsSortDirection}
      setStatsSortDirection={setStatsSortDirection}
      sortedStatsParticipants={sortedStatsParticipants}
      getPassportStyle={getPassportStyle}
      normalizePassport={normalizePassport}
      getPassportDotStyle={getPassportDotStyle}
      cprByParticipantId={cprByParticipantId}
      formatPoints={formatPoints}
      pointsByParticipantId={pointsByParticipantId}
    />
    <WallOfFameSection
      wallOfFameCategories={wallOfFameCategories}
      getPassportStyle={getPassportStyle}
      getPassportDotStyle={getPassportDotStyle}
      normalizePassport={normalizePassport}
      wallOfFameSexFilter={wallOfFameSexFilter}
      setWallOfFameSexFilter={setWallOfFameSexFilter}
    />
    </>
  );
}
