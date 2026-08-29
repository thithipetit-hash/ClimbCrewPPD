import { PASSPORT_STYLES } from "./ui-config.js";
import {
  REALISATION_CRITERION_WEIGHTS,
  getRealisationWeight,
  isSuccessfulLeadRealisation,
  isSuccessfulRealisation,
} from "./realisation-mode.js";
export { getDefaultSessionStatus as defaultSessionStatus } from "../../../backend/session-default-status.js";

export const GRADES = ["4","4a","4b","4c","5a","5a+","5b","5b+","5c","5c+","6a","6a+","6b","6b+","6c","6c+","7a","7a+","7b","7c"];

// Conservé pour compatibilité avec les anciens imports/tests.
// Le coefficient moderne est calculé par getRealisationWeight afin de tenir
// compte séparément du mode (en tête / moulinette) et du critère.
export const STYLE_WEIGHTS = {
  ...REALISATION_CRITERION_WEIGHTS,
  en_tete: 1,
  moulinette: 0.85,
};

export {
  isSuccessfulLeadRealisation,
  isSuccessfulRealisation,
  getRealisationMode,
  getRealisationWeight,
} from "./realisation-mode.js";

export const MAX_PARTICIPANTS = 18;

export function fullName(p) {
  return p ? `${p.nom} ${p.prenom}`.trim() : "";
}

export function formatRouteName(route) {
  const opener = String(route?.nomOuvreur || "").trim();
  const name = String(route?.nomVoie || "").trim();
  const label = [opener, name].filter(Boolean).join(" · ");
  return label || "Voie";
}

/**
 * Normalise le numéro de corde reçu de l'API ou des anciennes données.
 *
 * Les valeurs vides correspondent historiquement à la corde 0.
 * Toute valeur invalide ou hors de la plage 0 à 21 revient également à 0,
 * afin que l'affichage, le tri et le regroupement utilisent la même règle.
 */
export function normalizeRopeNumber(value) {
  const ropeNumber = Number(value);
  return Number.isInteger(ropeNumber) && ropeNumber >= 0 && ropeNumber <= 21
    ? ropeNumber
    : 0;
}

export function formatRouteForRealisation(route) {
  const rope = `Corde ${normalizeRopeNumber(route?.numeroCorde)}`;
  const grade = String(route?.cotationAjustee || route?.cotationReference || "nc").trim();
  const opener = String(route?.nomOuvreur || "").trim();
  const name = String(route?.nomVoie || "").trim();
  return [rope, grade, opener, name].filter(Boolean).join(" · ");
}

export function toLocalIso(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayIso() {
  const date = new Date();
  const day = date.getDay();

  // Si l'application est ouverte le week-end, on positionne directement
  // la vue sur le prochain lundi, car les séances sont en semaine.
  if (day === 6) date.setDate(date.getDate() + 2);
  if (day === 0) date.setDate(date.getDate() + 1);

  return toLocalIso(date);
}

export function normalizePassport(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function isDiscoveryPassport(passport) {
  const normalized = normalizePassport(passport);
  return normalized === "decouverte" || normalized === "decouvertes";
}

export function getPassportStyle(participant) {
  const isCotisant = Boolean(participant?.cotisation);
  const hasFfmeLicence = Boolean(participant?.ffme);
  const borderColor = isCotisant ? "#22c55e" : "#ef4444";

  return {
    color: "inherit",
    background: "transparent",
    border: `2px ${hasFfmeLicence ? "solid" : "dashed"} ${borderColor}`,
    boxShadow: isCotisant
      ? "0 0 0 1px rgba(34,197,94,.18)"
      : "0 0 0 1px rgba(239,68,68,.18)",
  };
}

export function getPassportDotStyle(participant) {
  const baseStyle = isDiscoveryPassport(participant?.passport)
    ? PASSPORT_STYLES.decouverte
    : PASSPORT_STYLES[participant?.passport] || PASSPORT_STYLES.sans;

  return { backgroundColor: baseStyle.backgroundColor };
}

export function gradeToIndex(grade) {
  return GRADES.indexOf(grade);
}

export function indexToGrade(index) {
  const i = Math.max(0, Math.min(GRADES.length - 1, index));
  return GRADES[i];
}

export function getRouteBackgroundColor(color) {
  const normalized = String(color || "").trim().toLowerCase();
  const map = {
    bleu: "#60a5fa", bleue: "#60a5fa", blue: "#60a5fa", rouge: "#f87171", red: "#f87171",
    vert: "#4ade80", verte: "#4ade80", green: "#4ade80", jaune: "#facc15", yellow: "#facc15",
    orange: "#fb923c", violet: "#a78bfa", violette: "#a78bfa", purple: "#a78bfa", rose: "#f472b6",
    pink: "#f472b6", noir: "#94a3b8", noire: "#94a3b8", black: "#94a3b8", blanc: "#f8fafc",
    blanche: "#f8fafc", white: "#f8fafc", ocre: "#8b5a2b", ochre: "#8b5a2b", marron: "#8b5a2b", brown: "#8b5a2b",
    gris: "#cbd5e1", grise: "#cbd5e1", gray: "#cbd5e1", grey: "#cbd5e1",
  };
  return map[normalized] || "#f8fafc";
}

export function getContrastingTextColor(backgroundColor) {
  const hex = String(backgroundColor || "").trim().replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return "#0f172a";
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 160 ? "#0f172a" : "#f8fafc";
}

export function getRouteCardStyle(color) {
  const backgroundColor = getRouteBackgroundColor(color);
  const normalizedColor = normalizePassport(color);
  return {
    backgroundColor,
    color: ["blanc", "white"].includes(normalizedColor)
      ? "#0f172a"
      : getContrastingTextColor(backgroundColor),
  };
}

export function formatDateFr(dateStr) {
  const formatted = new Date(`${dateStr}T12:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function formatDateShortFr(dateStr) {
  const [year, month, day] = String(dateStr || "").slice(0, 10).split("-");
  return year && month && day ? `${day}-${month}-${year}` : String(dateStr || "");
}

export function formatPoints(value) {
  return Number(value || 0).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
}

export function isWeekend(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  const day = d.getDay();
  return day === 0 || day === 6;
}

export function nextBusinessDay(dateStr, delta) {
  const d = new Date(`${dateStr}T12:00:00`);
  do { d.setDate(d.getDate() + delta); } while (d.getDay() === 0 || d.getDay() === 6);
  return d.toISOString().slice(0, 10);
}

export function calculateSimpleCpr(realisations, routesById, now = Date.now()) {
  const cutoff = now - (90 * 24 * 60 * 60 * 1000);

  const bestRecent = realisations
    .map((r) => {
      const route = routesById[r.voieId];
      const dateTimestamp = new Date(r.dateRealisation).getTime();
      if (!route || !Number.isFinite(dateTimestamp) || dateTimestamp < cutoff || dateTimestamp > now) return null;

      return {
        id: r.id,
        date: r.dateRealisation,
        grade: route.cotationAjustee,
        weightedIndex: gradeToIndex(route.cotationAjustee) * getRealisationWeight(r, route),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.weightedIndex - a.weightedIndex || b.date.localeCompare(a.date))
    .slice(0, 10);

  if (!bestRecent.length) return { currentGrade: null, averageIndex: null, timeline: [] };

  const averageIndex = bestRecent.reduce((sum, item) => sum + item.weightedIndex, 0) / bestRecent.length;
  return { currentGrade: indexToGrade(Math.round(averageIndex)), averageIndex, timeline: bestRecent };
}

/**
 * Reconstitue le CPR Club après chaque journée comportant une réalisation.
 * La formule reste strictement celle de calculateSimpleCpr : seule la date
 * d'observation change afin de produire une courbe historique cohérente.
 */
export function calculateCprHistory(realisations, routesById, now = Date.now()) {
  const validRealisations = realisations
    .filter((realisation) => Number.isFinite(new Date(realisation.dateRealisation).getTime()))
    .filter((realisation) => new Date(realisation.dateRealisation).getTime() <= now);

  const dates = [...new Set(validRealisations.map((realisation) => (
    String(realisation.dateRealisation).slice(0, 10)
  )))].sort();

  return dates.map((date) => {
    const observationTime = new Date(`${date}T23:59:59`).getTime();
    const cpr = calculateSimpleCpr(validRealisations, routesById, observationTime);
    const dayRealisations = validRealisations.filter((realisation) => (
      String(realisation.dateRealisation).slice(0, 10) === date
    ));

    return {
      date,
      timestamp: observationTime,
      currentGrade: cpr.currentGrade,
      averageIndex: cpr.averageIndex,
      includedIds: cpr.timeline.map((item) => String(item.id)),
      realisationIds: dayRealisations.map((item) => String(item.id)),
    };
  }).filter((point) => point.currentGrade && Number.isFinite(point.averageIndex));
}

export function weightedMedian(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => gradeToIndex(a.grade) - gradeToIndex(b.grade));
  const total = sorted.reduce((sum, item) => sum + item.weight, 0);
  let cumulative = 0;
  for (const item of sorted) {
    cumulative += item.weight;
    if (cumulative >= total / 2) return item.grade;
  }
  return sorted[sorted.length - 1].grade;
}

/**
 * Statistiques des réalisations en tête par cotation de voie.
 */
export function calculateLeadRealisationStats(routes, realisations, routesById) {
  const routesByGrade = Object.fromEntries(GRADES.map((grade) => [grade, 0]));
  const leadsByGrade = Object.fromEntries(GRADES.map((grade) => [grade, 0]));

  routes.forEach((route) => {
    const routeGrade = route.cotationAjustee || route.cotationReference;
    if (Object.hasOwn(routesByGrade, routeGrade)) routesByGrade[routeGrade] += 1;
  });

  const successfulLeadRealisations = realisations.filter((realisation) => (
    isSuccessfulLeadRealisation(realisation, routesById[realisation.voieId])
  ));

  successfulLeadRealisations.forEach((realisation) => {
    const route = routesById[realisation.voieId];
    const routeGrade = route?.cotationAjustee || route?.cotationReference;
    if (Object.hasOwn(leadsByGrade, routeGrade)) leadsByGrade[routeGrade] += 1;
  });

  return {
    total: successfulLeadRealisations.length,
    byGrade: GRADES
      .filter((grade) => routesByGrade[grade] > 0)
      .map((grade) => {
        const routeCount = routesByGrade[grade];
        const leadCount = leadsByGrade[grade];
        return {
          grade,
          routeCount,
          leadCount,
          ratio: leadCount / routeCount,
        };
      }),
  };
}

/**
 * Chaque voie distribue 1000 points entre les grimpeurs qui l'ont réalisée en tête.
 */
export function calculateLeadPoints(participants, routes, realisations) {
  const points = Object.fromEntries(participants.map((participant) => [participant.id, 0]));

  routes.forEach((route) => {
    const leadClimbers = new Set(
      realisations
        .filter((realisation) => (
          String(realisation.voieId) === String(route.id)
          && isSuccessfulLeadRealisation(realisation, route)
        ))
        .map((realisation) => String(realisation.participantId))
    );

    if (leadClimbers.size === 0) return;
    const share = 1000 / leadClimbers.size;

    leadClimbers.forEach((participantId) => {
      points[participantId] = (points[participantId] || 0) + share;
    });
  });

  return points;
}

/**
 * Agrège les cotations proposées par voie (moyenne, médiane, consensus pondéré par le CPR).
 */
export function calculateRouteAggregates(routes, realisations, cprByParticipantId) {
  return Object.fromEntries(
    routes.map((route) => {
      const proposals = realisations
        .filter((realisation) => realisation.voieId === route.id && realisation.cotationProposee)
        .map((realisation) => {
          const cprIndex = cprByParticipantId[realisation.participantId]?.averageIndex;
          const normalizedCpr = Number.isFinite(cprIndex)
            ? Math.max(0, Math.min(GRADES.length - 1, cprIndex)) / (GRADES.length - 1)
            : 0;

          return {
            grade: realisation.cotationProposee,
            realisation,
            consensusWeight: 1 + normalizedCpr,
          };
        });

      const weightedProposals = proposals.map((proposal) => ({ grade: proposal.grade, weight: getRealisationWeight(proposal.realisation, route) }));

      const distribution = GRADES.filter((g) => proposals.some((p) => p.grade === g)).map((g) => ({
        grade: g,
        count: proposals.filter((p) => p.grade === g).length,
      }));

      const averageIndex = proposals.length
        ? proposals.reduce((sum, p) => sum + gradeToIndex(p.grade), 0) / proposals.length
        : null;

      const medianGrade = proposals.length
        ? indexToGrade([...proposals].map((p) => gradeToIndex(p.grade)).sort((a, b) => a - b)[Math.floor((proposals.length - 1) / 2)])
        : null;

      const consensusWeightTotal = proposals.reduce((sum, proposal) => sum + proposal.consensusWeight, 0);
      const consensusIndex = consensusWeightTotal
        ? proposals.reduce(
            (sum, proposal) => sum + (gradeToIndex(proposal.grade) * proposal.consensusWeight),
            0
          ) / consensusWeightTotal
        : null;

      return [route.id, {
        count: proposals.length,
        averageGrade: averageIndex === null ? null : indexToGrade(Math.round(averageIndex)),
        medianGrade,
        weightedMedianGrade: proposals.length >= 5 ? weightedMedian(weightedProposals) : null,
        consensusGrade: consensusIndex === null ? null : indexToGrade(Math.round(consensusIndex)),
        consensusIndex,
        distribution,
      }];
    })
  );
}

/**
 * Classements publics du Tableau d’honneur. `participants` doit déjà être filtré
 * (par exemple par sexe) par l'appelant. Seules les personnes inscrites à au
 * moins une séance sont classées, y compris lorsqu'elles ont une valeur nulle.
 */
export function calculateWallOfFameCategories({
  participants,
  realisations,
  routesById,
  cprByParticipantId,
  pointsByParticipantId,
  participationCount,
}) {
  const rankedParticipants = participants.filter((participant) => (
    Number(participationCount?.[participant.id] || 0) > 0
  ));

  const successfulRealisationsFor = (participantId) => realisations
    .filter((realisation) => String(realisation.participantId) === String(participantId))
    .filter(isSuccessfulRealisation);

  const distinctRoutesFor = (participantId, predicate) => new Set(
    realisations
      .filter((realisation) => String(realisation.participantId) === String(participantId))
      .filter(predicate)
      .map((realisation) => String(realisation.voieId))
  ).size;

  const sessionRouteSetsFor = (participantId) => {
    const groups = new Map();
    successfulRealisationsFor(participantId).forEach((realisation) => {
      const sessionKey = realisation.sessionId || String(realisation.dateRealisation || "").slice(0, 10);
      if (!sessionKey) return;
      if (!groups.has(sessionKey)) groups.set(sessionKey, new Set());
      groups.get(sessionKey).add(String(realisation.voieId));
    });
    return [...groups.values()];
  };

  const maxRoutesInSessionFor = (participantId) => {
    const routeSets = sessionRouteSetsFor(participantId);
    return routeSets.length ? Math.max(...routeSets.map((routeIds) => routeIds.size)) : 0;
  };

  const maxDifficultyInSessionFor = (participantId) => sessionRouteSetsFor(participantId).reduce((record, routeIds) => {
    const total = [...routeIds].reduce((sum, routeId) => {
      const route = routesById[routeId];
      const routeGrade = route?.cotationAjustee || route?.cotationReference;
      const gradeIndex = gradeToIndex(routeGrade);
      return sum + (gradeIndex >= 0 ? gradeIndex + 1 : 0);
    }, 0);
    return Math.max(record, total);
  }, 0);

  const buildRanking = ({ title, getValue, formatValue }) => {
    const sorted = rankedParticipants
      .map((participant) => ({ participant, value: getValue(participant) }))
      .filter((entry) => Number.isFinite(entry.value))
      .sort((a, b) => b.value - a.value || fullName(a.participant).localeCompare(fullName(b.participant), "fr"));

    let previousValue = null;
    let previousRank = 0;

    return {
      title,
      entries: sorted.map((entry, index) => {
        const rank = previousValue !== null && entry.value === previousValue ? previousRank : index + 1;
        previousValue = entry.value;
        previousRank = rank;
        return { ...entry, rank, displayValue: formatValue(entry.value, entry.participant) };
      }),
    };
  };

  return [
    buildRanking({
      title: "Meilleurs CPR",
      getValue: (participant) => {
        const averageIndex = cprByParticipantId[participant.id]?.averageIndex;
        return Number.isFinite(averageIndex) ? averageIndex : -1;
      },
      formatValue: (_value, participant) => cprByParticipantId[participant.id]?.currentGrade || "nc",
    }),
    buildRanking({
      title: "Plus de points",
      getValue: (participant) => pointsByParticipantId[participant.id] || 0,
      formatValue: (value) => `${formatPoints(value)} points`,
    }),
    buildRanking({
      title: "Plus de participations",
      getValue: (participant) => participationCount[participant.id] || 0,
      formatValue: (value) => `${value} séance${value > 1 ? "s" : ""}`,
    }),
    buildRanking({
      title: "Nombre total de voies",
      getValue: (participant) => successfulRealisationsFor(participant.id).length,
      formatValue: (value) => `${value} voie${value > 1 ? "s" : ""}`,
    }),
    buildRanking({
      title: "Maximum de voies en une séance",
      getValue: (participant) => maxRoutesInSessionFor(participant.id),
      formatValue: (value) => `${value} voie${value > 1 ? "s" : ""}`,
    }),
    buildRanking({
      title: "Difficulté cumulée en une séance",
      getValue: (participant) => maxDifficultyInSessionFor(participant.id),
      formatValue: (value) => `${value} point${value > 1 ? "s" : ""}`,
    }),
    buildRanking({
      title: "Voies distinctes réalisées",
      getValue: (participant) => distinctRoutesFor(participant.id, isSuccessfulRealisation),
      formatValue: (value) => `${value} voie${value > 1 ? "s" : ""}`,
    }),
    buildRanking({
      title: "Voies réalisées en tête",
      getValue: (participant) => distinctRoutesFor(
        participant.id,
        (realisation) => isSuccessfulLeadRealisation(realisation, routesById[realisation.voieId])
      ),
      formatValue: (value) => `${value} voie${value > 1 ? "s" : ""}`,
    }),
    buildRanking({
      title: "Champions du vol",
      getValue: (participant) => realisations.filter(
        (realisation) => String(realisation.participantId) === String(participant.id) && realisation.chute === true
      ).length,
      formatValue: (value) => `${value} vol${value > 1 ? "s" : ""}`,
    }),
  ];
}
