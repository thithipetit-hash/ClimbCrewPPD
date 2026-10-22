import {
  REALISATION_CRITERIA,
  REALISATION_CRITERION_LABELS,
  REALISATION_MODES,
  REALISATION_MODE_LABELS,
  formatRealisationModeCriterion,
  getRealisationCriterion,
  getRealisationMode,
  isSuccessfulRealisation,
} from "./realisation-mode.js";

const CRITERION_PRIORITY = new Map([
  ["a_vue", 0],
  ["flash", 1],
  ["travaillee", 2],
  ["avec_repos", 3],
  ["projet", 4],
  ["non_enchainee", 5],
  ["test", 6],
]);

export const ROUTE_REALISATION_FILTER_OPTIONS = [
  { value: "all", label: "Toutes les voies" },
  { value: "none", label: "Non essayées" },
  ...REALISATION_CRITERIA.map((criterion) => ({
    value: `criterion:${criterion}`,
    label: REALISATION_CRITERION_LABELS[criterion] || criterion,
  })),
  ...REALISATION_MODES.map((mode) => ({
    value: `mode:${mode}`,
    label: REALISATION_MODE_LABELS[mode] || mode,
  })),
];

export const ROUTE_REALISATION_EXCLUSION_OPTIONS = ROUTE_REALISATION_FILTER_OPTIONS
  .filter(({ value }) => value.startsWith("criterion:") || value.startsWith("mode:"))
  .map(({ value, label }) => ({ value, label: `Jamais : ${label}` }));

export function groupParticipantRealisationsByRoute(realisations, participantId) {
  const participantKey = String(participantId || "");
  const grouped = new Map();
  if (!participantKey) return grouped;

  for (const realisation of realisations || []) {
    if (String(realisation?.participantId || "") !== participantKey) continue;
    const routeId = String(realisation?.voieId || "");
    if (!routeId) continue;
    const current = grouped.get(routeId) || [];
    current.push(realisation);
    grouped.set(routeId, current);
  }
  return grouped;
}

function realisationPriority(realisation, route) {
  const criterion = getRealisationCriterion(realisation);
  const criterionPriority = CRITERION_PRIORITY.get(criterion) ?? 99;
  const modePriority = getRealisationMode(realisation, route) === "en_tete" ? 0 : 1;
  const date = String(realisation?.dateRealisation || "");
  return [criterionPriority, modePriority, date];
}

export function getBestRouteRealisation(realisations, route) {
  const list = Array.isArray(realisations) ? [...realisations] : [];
  if (!list.length) return null;

  return list.sort((left, right) => {
    const [leftCriterion, leftMode, leftDate] = realisationPriority(left, route);
    const [rightCriterion, rightMode, rightDate] = realisationPriority(right, route);
    return leftCriterion - rightCriterion
      || leftMode - rightMode
      || rightDate.localeCompare(leftDate);
  })[0];
}

export function formatRouteProgress(realisations, route) {
  const best = getBestRouteRealisation(realisations, route);
  if (!best) return "Non essayée";
  const prefix = isSuccessfulRealisation(best) ? "Réalisée" : "Essayée";
  return `${prefix} · ${formatRealisationModeCriterion(best, route)}`;
}

function matchesSingleRouteRealisationFilter(realisations, route, filter) {
  if (filter === "none") return realisations.length === 0;

  const [kind, value] = String(filter).split(":", 2);
  if (kind === "criterion") {
    return realisations.some((realisation) => getRealisationCriterion(realisation) === value);
  }
  if (kind === "mode") {
    return realisations.some((realisation) => getRealisationMode(realisation, route) === value);
  }
  return false;
}

function routeSupportsExcludedMode(route, filter) {
  // Une voie limitée à la moulinette ne doit pas compter parmi les voies à faire en tête.
  if (filter === "mode:en_tete" && (route?.moulinetteOnly || route?.moulinette_only)) {
    return false;
  }
  return true;
}

export function matchesRouteRealisationFilter(realisations, route, filterValue, excludedFilters = []) {
  const list = Array.isArray(realisations) ? realisations : [];
  const selectedFilters = Array.isArray(filterValue) ? filterValue : [filterValue || "all"];
  const exclusions = Array.isArray(excludedFilters) ? excludedFilters : [];

  // Les inclusions sont alternatives ; les exclusions s'appliquent toutes.
  const included = selectedFilters.length === 0
    || selectedFilters.includes("all")
    || selectedFilters.some((filter) => matchesSingleRouteRealisationFilter(list, route, filter));
  return included && exclusions.every((filter) => (
    routeSupportsExcludedMode(route, filter)
    && !matchesSingleRouteRealisationFilter(list, route, filter)
  ));
}

export function filterRouteDisplayGroups(groups, realisationsByRoute, filterValue, excludedFilters = []) {
  return (groups || []).map((group) => ({
    ...group,
    routes: (group.routes || []).filter((route) => matchesRouteRealisationFilter(
      realisationsByRoute.get(String(route.id)) || [],
      route,
      filterValue,
      excludedFilters,
    )),
  }));
}
