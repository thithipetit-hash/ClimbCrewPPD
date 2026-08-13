import { GRADES, gradeToIndex, isSuccessfulRealisation, normalizeRopeNumber } from "./domain.js";
import { ROUTE_TAGS } from "./ui-config.js";
import { getRealisationCriterion } from "./realisation-mode.js";

const RESULT_VALUES = {
  a_vue: 1,
  flash: 0.95,
  travaillee: 0.85,
  avec_repos: 0.6,
  projet: 0.3,
  non_enchainee: 0.25,
  test: 0.2,
};

const RECOMMENDATION_SLOTS_WITH_HISTORY = [
  { purpose: "Échauffement", targetDelta: -2 },
  { purpose: "Consolidation", targetDelta: -1 },
  { purpose: "Repère CPR", targetDelta: 0 },
  { purpose: "Point faible", targetDelta: 0 },
  { purpose: "Défi", targetDelta: 1 },
];

const RECOMMENDATION_SLOTS_WITHOUT_HISTORY = [
  { purpose: "Découverte", targetDelta: 0 },
  { purpose: "Découverte", targetDelta: 0 },
  { purpose: "Progression", targetDelta: 1 },
  { purpose: "Progression", targetDelta: 1 },
  { purpose: "Petit défi", targetDelta: 2 },
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function routeGrade(route) {
  return String(route?.cotationAjustee || route?.cotationReference || "").trim();
}

function routeTags(route) {
  const tags = Array.isArray(route?.tags)
    ? route.tags
    : typeof route?.tags === "string"
      ? route.tags.split(",")
      : [];

  return [...new Set(tags.map((tag) => String(tag || "").trim().toLowerCase()).filter(Boolean))];
}

function median(values) {
  if (!values.length) return -1;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[middle];
  return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function resolveReferenceGradeIndex({ cprGrade, realisations = [], routesById = {}, routes = [] }) {
  const cprIndex = gradeToIndex(cprGrade);
  if (cprIndex >= 0) return { index: cprIndex, source: "cpr" };

  const successfulGradeIndexes = realisations
    .filter(isSuccessfulRealisation)
    .map((realisation) => gradeToIndex(routeGrade(routesById[realisation.voieId])))
    .filter((index) => index >= 0);

  if (successfulGradeIndexes.length) {
    return { index: median(successfulGradeIndexes), source: "history" };
  }

  const availableGradeIndexes = routes
    .map((route) => gradeToIndex(routeGrade(route)))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b);

  return {
    index: availableGradeIndexes[0] ?? -1,
    source: availableGradeIndexes.length ? "routes" : "none",
  };
}

function performanceValue(realisation, route, referenceGradeIndex) {
  const criterion = getRealisationCriterion(realisation);
  let value = RESULT_VALUES[criterion];

  if (!Number.isFinite(value)) {
    value = isSuccessfulRealisation(realisation) ? 0.8 : 0.2;
  }

  const gradeIndex = gradeToIndex(routeGrade(route));
  if (referenceGradeIndex >= 0 && gradeIndex >= 0) {
    const gradeDelta = clamp(gradeIndex - referenceGradeIndex, -3, 3);
    value += gradeDelta * 0.05;
  }

  return clamp(value, 0, 1);
}

export function calculateClimberProfile({ realisations = [], routesById = {}, cprGrade = "" } = {}) {
  const reference = resolveReferenceGradeIndex({ cprGrade, realisations, routesById });

  const characteristics = ROUTE_TAGS.map((definition) => {
    const relevant = realisations.filter((realisation) => (
      routeTags(routesById[realisation.voieId]).includes(definition.value)
    ));

    if (!relevant.length) {
      return {
        ...definition,
        score: null,
        attempts: 0,
        successful: 0,
      };
    }

    const totalPerformance = relevant.reduce((sum, realisation) => (
      sum + performanceValue(realisation, routesById[realisation.voieId], reference.index)
    ), 0);

    // Deux performances virtuelles à 50 % stabilisent les faibles volumes :
    // une seule croix ne transforme donc pas artificiellement un axe en 100 %.
    const smoothedScore = (1 + totalPerformance) / (2 + relevant.length);

    return {
      ...definition,
      score: Math.round(smoothedScore * 100),
      attempts: relevant.length,
      successful: relevant.filter(isSuccessfulRealisation).length,
    };
  });

  const measured = characteristics.filter((item) => Number.isFinite(item.score));
  const strengths = measured
    .filter((item) => item.score >= 60)
    .sort((a, b) => b.score - a.score || b.attempts - a.attempts || a.label.localeCompare(b.label, "fr"))
    .slice(0, 2);
  const developmentAreas = measured
    .filter((item) => item.score < 60)
    .sort((a, b) => a.score - b.score || b.attempts - a.attempts || a.label.localeCompare(b.label, "fr"))
    .slice(0, 2);
  const priorityTags = [...measured]
    .sort((a, b) => a.score - b.score || b.attempts - a.attempts || a.label.localeCompare(b.label, "fr"))
    .slice(0, 2);

  return {
    characteristics,
    strengths,
    developmentAreas,
    priorityTags,
    measuredCharacteristicCount: measured.length,
    referenceGradeIndex: reference.index,
    referenceGrade: reference.index >= 0 ? GRADES[reference.index] : null,
    referenceSource: reference.source,
  };
}

function gradeRelation(delta, referenceSource) {
  if (referenceSource === "cpr") {
    if (delta === 0) return "autour du CPR";
    return delta > 0 ? `CPR +${delta}` : `CPR ${delta}`;
  }
  if (delta === 0) return "niveau de référence";
  return delta > 0 ? `référence +${delta}` : `référence ${delta}`;
}

export function recommendRoutesForNextSession({
  routes = [],
  realisations = [],
  routesById = {},
  cprGrade = "",
  profile = null,
  limit = 5,
} = {}) {
  if (!routes.length || limit <= 0) return [];

  const resolvedProfile = profile || calculateClimberProfile({ realisations, routesById, cprGrade });
  const reference = resolveReferenceGradeIndex({ cprGrade, realisations, routesById, routes });
  if (reference.index < 0) return [];

  const successfulRouteIds = new Set(
    realisations
      .filter(isSuccessfulRealisation)
      .map((realisation) => String(realisation.voieId || "")),
  );
  const attemptedRouteIds = new Set(
    realisations.map((realisation) => String(realisation.voieId || "")),
  );
  const priorityTags = resolvedProfile.priorityTags.map((item) => item.value);
  const slots = reference.source === "routes"
    ? RECOMMENDATION_SLOTS_WITHOUT_HISTORY
    : RECOMMENDATION_SLOTS_WITH_HISTORY;

  const candidates = routes
    .map((route) => ({ route, gradeIndex: gradeToIndex(routeGrade(route)), tags: routeTags(route) }))
    .filter((candidate) => candidate.gradeIndex >= 0);

  const selected = [];
  const selectedRouteIds = new Set();
  const selectedRopes = new Set();

  for (const slot of slots.slice(0, limit)) {
    const ranked = candidates
      .filter(({ route }) => !selectedRouteIds.has(String(route.id)))
      .map((candidate) => {
        const routeId = String(candidate.route.id);
        const delta = candidate.gradeIndex - reference.index;
        const distance = Math.abs(delta - slot.targetDelta);
        const isSuccessful = successfulRouteIds.has(routeId);
        const isAttempted = attemptedRouteIds.has(routeId);
        const matchedPriorityTags = candidate.tags.filter((tag) => priorityTags.includes(tag));
        const rope = normalizeRopeNumber(candidate.route.numeroCorde);

        let score = 100 - (distance * 22);
        score += isSuccessful ? -28 : 28;
        if (isAttempted && !isSuccessful) score += 18;
        score += matchedPriorityTags.length * (slot.purpose === "Point faible" ? 18 : 7);
        if (!selectedRopes.has(rope)) score += 7;
        if (candidate.tags.some((tag) => !selected.flatMap((item) => item.tags).includes(tag))) score += 4;

        return {
          ...candidate,
          score,
          delta,
          isSuccessful,
          isAttempted,
          matchedPriorityTags,
          rope,
        };
      })
      .sort((a, b) => (
        b.score - a.score
        || Math.abs(a.delta - slot.targetDelta) - Math.abs(b.delta - slot.targetDelta)
        || a.gradeIndex - b.gradeIndex
        || a.rope - b.rope
        || String(a.route.id).localeCompare(String(b.route.id))
      ));

    const choice = ranked[0];
    if (!choice) break;

    selectedRouteIds.add(String(choice.route.id));
    selectedRopes.add(choice.rope);

    const reasonParts = [slot.purpose, gradeRelation(choice.delta, reference.source)];
    if (choice.isAttempted && !choice.isSuccessful) reasonParts.push("projet à reprendre");
    if (choice.matchedPriorityTags.length) {
      const labels = choice.matchedPriorityTags
        .map((value) => ROUTE_TAGS.find((tag) => tag.value === value)?.label || value)
        .join(" / ");
      reasonParts.push(`axe ${labels}`);
    }

    selected.push({
      route: choice.route,
      purpose: slot.purpose,
      reason: reasonParts.join(" · "),
      gradeDelta: choice.delta,
      tags: choice.tags,
      matchedPriorityTags: choice.matchedPriorityTags,
    });
  }

  return selected;
}
