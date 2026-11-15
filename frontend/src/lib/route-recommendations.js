import { filterCprRealisations } from "../../../shared/cpr.js";
import { calculateCprHistory, gradeToIndex, GRADES } from "./domain.js";
import { isSuccessfulLeadRealisation, isSuccessfulRealisation } from "./realisation-mode.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_SESSIONS = 3;

const RECOMMENDATION_STEPS = {
  consolidation: [
    { label: "Échauffement", offset: -3 },
    { label: "Reprise", offset: -2 },
    { label: "Consolidation", offset: -1 },
    { label: "Régularité", offset: 0 },
    { label: "Validation", offset: 0 },
    { label: "Bonus", offset: 1 },
  ],
  progression: [
    { label: "Échauffement", offset: -3 },
    { label: "Préparation", offset: -1 },
    { label: "Progression", offset: 1 },
    { label: "Projet", offset: 2 },
    { label: "Défi", offset: 2 },
    { label: "Bonus", offset: 3 },
  ],
};

function routeGradeIndex(route) {
  return gradeToIndex(route?.cotationAjustee || route?.cotationReference);
}

function getRecentCprSessions(realisations, routesById, resetAt, now) {
  return calculateCprHistory(realisations, routesById, now, resetAt)
    .filter((point) => Number.isFinite(point.averageIndex) && point.timestamp >= now - 90 * DAY_MS)
    .slice(-RECENT_SESSIONS);
}

function getReferenceIndex(recentCprSessions, currentCpr, validRealisations, routesById) {
  const currentIndex = currentCpr?.averageIndex;
  if (recentCprSessions.length) {
    const totalWeight = recentCprSessions.length * (recentCprSessions.length + 1) / 2;
    const recentIndex = recentCprSessions.reduce(
      (sum, session, index) => sum + session.averageIndex * (index + 1), 0,
    ) / totalWeight;
    return Number.isFinite(currentIndex) ? currentIndex * 0.55 + recentIndex * 0.45 : recentIndex;
  }
  if (Number.isFinite(currentIndex)) return currentIndex;

  // Sans CPR calculable, conserver un point de départ fondé sur les réussites connues.
  const recentSuccesses = [...validRealisations]
    .sort((a, b) => String(b.dateRealisation || "").localeCompare(String(a.dateRealisation || "")))
    .slice(0, 20)
    .filter((realisation) => isSuccessfulRealisation(realisation, routesById[realisation.voieId]))
    .map((realisation) => routeGradeIndex(routesById[realisation.voieId]))
    .filter((index) => index >= 0);
  return recentSuccesses.length
    ? recentSuccesses.reduce((sum, index) => sum + index, 0) / recentSuccesses.length
    : 8;
}

export function buildRouteRecommendations({
  routesById = {},
  realisations = [],
  currentCpr = {},
  resetAt = null,
  mode = "consolidation",
  now = Date.now(),
} = {}) {
  const steps = RECOMMENDATION_STEPS[mode] || RECOMMENDATION_STEPS.consolidation;
  const validRealisations = filterCprRealisations(realisations, resetAt);
  const recentCprSessions = getRecentCprSessions(validRealisations, routesById, resetAt, now);
  const referenceIndex = getReferenceIndex(recentCprSessions, currentCpr, validRealisations, routesById);

  const lastRealisationDate = validRealisations
    .map((realisation) => new Date(realisation.dateRealisation).getTime())
    .filter((date) => Number.isFinite(date) && date <= now)
    .sort((a, b) => b - a)[0];
  const daysSince = lastRealisationDate === undefined ? 15 : Math.max(0, Math.floor((now - lastRealisationDate) / DAY_MS));
  const recovery = daysSince > 14 ? 2 : daysSince < 2 ? 1 : 0;
  const targetIndex = Math.round(referenceIndex) - Math.min(recovery, mode === "progression" ? 1 : 2);

  const routes = Object.values(routesById).filter(
    (route) => route.active !== false && routeGradeIndex(route) >= 0,
  );
  const alreadyCompletedInLead = new Set(validRealisations
    .filter((realisation) => isSuccessfulLeadRealisation(realisation, routesById[realisation.voieId]))
    .map((realisation) => String(realisation.voieId)));
  const used = new Set();

  const recommendations = steps.map(({ label, offset }) => {
    const desiredIndex = Math.max(0, Math.min(GRADES.length - 1, targetIndex + offset));
    const candidates = routes.filter((route) => !used.has(String(route.id)));
    candidates.sort((a, b) => {
      const score = (route) => {
        const distance = Math.abs(routeGradeIndex(route) - desiredIndex);
        const moulinettePenalty = mode === "progression" && offset >= 0
          && (route.moulinetteOnly || route.moulinette_only) ? 1.5 : 0;
        const alreadyDonePenalty = alreadyCompletedInLead.has(String(route.id)) ? 0.25 : 0;
        return distance + moulinettePenalty + alreadyDonePenalty;
      };
      return score(a) - score(b)
        || String(a.id).localeCompare(String(b.id), "fr");
    });
    const route = candidates[0];
    if (route) used.add(String(route.id));
    return route ? { label, route } : null;
  }).filter(Boolean);

  return {
    recommendations,
    referenceIndex,
    referenceGrade: GRADES[Math.max(0, Math.min(GRADES.length - 1, Math.round(referenceIndex)))],
    recentCprSessions,
    daysSince,
    hasCprReference: recentCprSessions.length > 0 || Number.isFinite(currentCpr?.averageIndex),
  };
}
