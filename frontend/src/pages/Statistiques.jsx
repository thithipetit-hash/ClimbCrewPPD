import React, { useMemo } from "react";
import StatisticsSection from "../sections/StatisticsSection.jsx";
import { buildRouteRealisationStatistics } from "../lib/route-realisation-statistics.js";

export default function Statistiques({
  sessionStats,
  topRouteRankings,
  leadRealisationStats,
  routes,
  realisations,
  sessions = [],
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
  pointsByParticipantId
}) {

  const passportCounts = sortedStatsParticipants.reduce((counts, participant) => {
    const passport = normalizePassport(participant.passport) || "sans";
    counts[passport] = (counts[passport] || 0) + 1;
    return counts;
  }, {});

  const freeSessions = sessions.filter((session) => session.status === "libre");
  const supervisedSessions = sessions.filter((session) => session.status === "encadree");
  const freeAndSupervisedParticipations = [...freeSessions, ...supervisedSessions].reduce(
    (total, session) => total + (Array.isArray(session.participantIds) ? session.participantIds.length : 0),
    0,
  );

  const routeRealisationStats = useMemo(
    () => buildRouteRealisationStatistics(routes, realisations),
    [routes, realisations],
  );

  const extendedSessionStats = {
    ...sessionStats,
    passportCounts,
    nombreSeancesLibres: freeSessions.length,
    nombreSeancesEncadrees: supervisedSessions.length,
    nombreParticipationsLibreEncadree: freeAndSupervisedParticipations,
  };

  return (
    <StatisticsSection
      sessionStats={extendedSessionStats}
      topRouteRankings={topRouteRankings}
      leadRealisationStats={leadRealisationStats}
      routeRealisationStats={routeRealisationStats}
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
  );
}
