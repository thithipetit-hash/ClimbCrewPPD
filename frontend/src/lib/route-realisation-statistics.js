import {
  REALISATION_CRITERIA,
  REALISATION_MODES,
  getRealisationCriterion,
  getRealisationMode,
} from "./realisation-mode.js";
import { gradeToIndex, normalizeRopeNumber } from "./domain.js";

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


const NUMERIC_COLUMN_KEYS = new Set([
  "rope",
  "total",
  "lead",
  "toprope",
  "onsight",
  "flash",
  "worked",
  "withRest",
  "project",
  "notSent",
  "test",
]);

export function routeRealisationStatisticValue(row, key, { formatRouteName = (route) => route?.nomVoie || "" } = {}) {
  switch (key) {
    case "rope": return normalizeRopeNumber(row?.route?.numeroCorde);
    case "route": return formatRouteName(row?.route || {});
    case "grade": return row?.route?.cotationAjustee || row?.route?.cotationReference || "nc";
    case "total": return Number(row?.total || 0);
    case "lead": return Number(row?.modeCounts?.en_tete || 0);
    case "toprope": return Number(row?.modeCounts?.moulinette || 0);
    case "onsight": return Number(row?.criterionCounts?.a_vue || 0);
    case "flash": return Number(row?.criterionCounts?.flash || 0);
    case "worked": return Number(row?.criterionCounts?.travaillee || 0);
    case "withRest": return Number(row?.criterionCounts?.avec_repos || 0);
    case "project": return Number(row?.criterionCounts?.projet || 0);
    case "notSent": return Number(row?.criterionCounts?.non_enchainee || 0);
    case "test": return Number(row?.criterionCounts?.test || 0);
    default: return "";
  }
}

function matchesNumericFilter(value, query) {
  const match = String(query || "").trim().match(/^(<=|>=|=|<|>)?\s*(\d+)$/);
  if (!match) return false;
  const expected = Number(match[2]);
  switch (match[1] || "=") {
    case "<": return value < expected;
    case "<=": return value <= expected;
    case ">": return value > expected;
    case ">=": return value >= expected;
    default: return value === expected;
  }
}

function matchesColumnFilter(value, query, numeric) {
  const normalizedQuery = String(query || "").trim();
  if (!normalizedQuery) return true;
  if (numeric) return matchesNumericFilter(Number(value), normalizedQuery);
  return String(value ?? "").toLocaleLowerCase("fr").includes(normalizedQuery.toLocaleLowerCase("fr"));
}

function compareColumnValues(left, right, key) {
  if (NUMERIC_COLUMN_KEYS.has(key)) return Number(left) - Number(right);
  if (key === "grade") {
    const leftIndex = gradeToIndex(left);
    const rightIndex = gradeToIndex(right);
    if (leftIndex !== rightIndex) return leftIndex - rightIndex;
  }
  return String(left ?? "").localeCompare(String(right ?? ""), "fr", { numeric: true });
}

export function filterAndSortRouteRealisationStatistics(
  rows = [],
  {
    filters = {},
    sortKey = "rope",
    sortDirection = "asc",
    formatRouteName,
  } = {},
) {
  const direction = sortDirection === "desc" ? -1 : 1;
  const activeFilters = Object.entries(filters).filter(([, query]) => String(query || "").trim());

  return [...rows]
    .filter((row) => activeFilters.every(([key, query]) => (
      matchesColumnFilter(
        routeRealisationStatisticValue(row, key, { formatRouteName }),
        query,
        NUMERIC_COLUMN_KEYS.has(key),
      )
    )))
    .sort((left, right) => {
      const compared = compareColumnValues(
        routeRealisationStatisticValue(left, sortKey, { formatRouteName }),
        routeRealisationStatisticValue(right, sortKey, { formatRouteName }),
        sortKey,
      );
      if (compared) return compared * direction;

      const ropeCompared = normalizeRopeNumber(left?.route?.numeroCorde) - normalizeRopeNumber(right?.route?.numeroCorde);
      if (ropeCompared) return ropeCompared;
      return String(formatRouteName?.(left?.route || {}) || "").localeCompare(
        String(formatRouteName?.(right?.route || {}) || ""),
        "fr",
      );
    });
}
