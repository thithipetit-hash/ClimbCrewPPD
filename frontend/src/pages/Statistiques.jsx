import React, { useEffect, useState } from "react";
import StatisticsSection from "../sections/StatisticsSection.jsx";
import WallOfFameSection from "../sections/WallOfFameSection.jsx";
import { USE_API, apiFetch } from "../lib/api.js";
import { average, calculateBmi, realisationQualityScore } from "../lib/profile-physical.js";
import { getRealisationMode } from "../lib/realisation-mode.js";

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
  routes,
  realisations,
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

  const participantsById = Object.fromEntries(sortedStatsParticipants.map((participant) => [String(participant.id), participant]));
  const routePhysicalStats = (routes || []).map((route) => {
    const items = (realisations || []).filter((item) => String(item.voieId) === String(route.id));
    const successful = items.filter((item) => realisationQualityScore(item, route) >= 1000);
    const lead = successful.filter((item) => ["tete", "en-tete"].includes(getRealisationMode(item, route)));
    const moulinette = successful.filter((item) => getRealisationMode(item, route) === "moulinette");
    const leadClimbers = [...new Set(lead.map((item) => String(item.participantId)))]
      .map((id) => participantsById[id]).filter(Boolean);
    const mean = (key) => average(leadClimbers.map((participant) => participant[key]));
    const bmiValues = leadClimbers.map((participant) => calculateBmi(participant.heightCm, participant.weightKg)).filter(Number.isFinite);
    const apeValues = leadClimbers
      .filter((participant) => Number(participant.heightCm) > 0 && Number(participant.armSpanCm) > 0)
      .map((participant) => Number(participant.armSpanCm) - Number(participant.heightCm));
    return {
      route,
      leadCount: lead.length,
      moulinetteCount: moulinette.length,
      climberCount: leadClimbers.length,
      height: mean("heightCm"),
      weight: mean("weightKg"),
      span: mean("armSpanCm"),
      reach: mean("standingReachCm"),
      ape: average(apeValues),
      bmi: average(bmiValues),
    };
  }).sort((a, b) => String(a.route.numeroCorde || "").localeCompare(String(b.route.numeroCorde || ""), "fr", { numeric: true }));

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
      routePhysicalStats={routePhysicalStats}
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
