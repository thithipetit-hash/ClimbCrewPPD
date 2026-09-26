import {
  REALISATION_CRITERIA,
  REALISATION_MODES,
  getRealisationCriterion,
  getRealisationMode,
} from "./realisation-mode.js";

function emptyCounts(values) {
  return Object.fromEntries(values.map((value) => [value, 0]));
}

export function buildRouteRealisationStatistics(routes = [], realisations = []) {
  const realisationsByRouteId = new Map();

  realisations.forEach((realisation) => {
    const routeId = String(realisation?.voieId ?? "");
    if (!routeId) return;
    if (!realisationsByRouteId.has(routeId)) realisationsByRouteId.set(routeId, []);
    realisationsByRouteId.get(routeId).push(realisation);
  });

  return routes
    .filter((route) => route?.active !== false)
    .map((route) => {
      const modeCounts = emptyCounts(REALISATION_MODES);
      const criterionCounts = emptyCounts(REALISATION_CRITERIA);
      const combinationCounts = Object.fromEntries(
        REALISATION_MODES.map((mode) => [mode, emptyCounts(REALISATION_CRITERIA)]),
      );
      let historicalCriterionCount = 0;
      const routeRealisations = realisationsByRouteId.get(String(route.id)) || [];

      routeRealisations.forEach((realisation) => {
        const mode = getRealisationMode(realisation, route);
        const criterion = getRealisationCriterion(realisation);

        if (modeCounts[mode] !== undefined) modeCounts[mode] += 1;
        if (criterionCounts[criterion] !== undefined) {
          criterionCounts[criterion] += 1;
          if (combinationCounts[mode]?.[criterion] !== undefined) {
            combinationCounts[mode][criterion] += 1;
          }
        } else {
          historicalCriterionCount += 1;
        }
      });

      return {
        route,
        total: routeRealisations.length,
        modeCounts,
        criterionCounts,
        combinationCounts,
        historicalCriterionCount,
      };
    });
}

export function filterRouteRealisationStatistics(
  rows = [],
  { mode = "all", criterion = "all" } = {},
) {
  return rows.filter((row) => {
    if (mode === "all" && criterion === "all") return true;
    if (mode !== "all" && criterion !== "all") {
      return (row.combinationCounts?.[mode]?.[criterion] || 0) > 0;
    }
    if (mode !== "all") return (row.modeCounts?.[mode] || 0) > 0;
    return (row.criterionCounts?.[criterion] || 0) > 0;
  });
}
