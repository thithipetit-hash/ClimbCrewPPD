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

export function matchesRouteRealisationFilter(realisations, route, filterValue) {
  const list = Array.isArray(realisations) ? realisations : [];
  const filter = String(filterValue || "all");
  if (filter === "all") return true;
  if (filter === "none") return list.length === 0;

  const [kind, value] = filter.split(":", 2);
  if (kind === "criterion") {
    return list.some((realisation) => getRealisationCriterion(realisation) === value);
  }
  if (kind === "mode") {
    return list.some((realisation) => getRealisationMode(realisation, route) === value);
  }
  return true;
}

export function filterRouteDisplayGroups(groups, realisationsByRoute, filterValue) {
  return (groups || []).map((group) => ({
    ...group,
    routes: (group.routes || []).filter((route) => matchesRouteRealisationFilter(
      realisationsByRoute.get(String(route.id)) || [],
      route,
      filterValue,
    )),
  }));
}