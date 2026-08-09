/**
 * Règles métier d'escalade isolées de React.
 * Ces fonctions ne modifient jamais leurs paramètres et restent testables seules.
 */

export const GRADES = [
  "4a", "4b", "4c", "5a", "5b", "5c", "6a", "6a+",
  "6b", "6b+", "6c", "6c+", "7a", "7a+", "7b",
];

export const STYLE_WEIGHTS = {
  a_vue: 1.25,
  flash: 1.2,
  en_tete: 1,
  moulinette: 0.85,
  avec_repos: 0.6,
  travaillee: 0.75,
  projet: 0.3,
  non_enchainee: 0.2,
  test: 0.1,
};

export function gradeToIndex(grade) {
  return GRADES.indexOf(grade);
}

export function indexToGrade(index) {
  const boundedIndex = Math.max(0, Math.min(GRADES.length - 1, index));
  return GRADES[boundedIndex];
}

export function calculateSimpleCpr(realisations, routesById, now = Date.now()) {
  const cutoff = now - (90 * 24 * 60 * 60 * 1000);

  const bestRecent = realisations
    .map((realisation) => {
      const route = routesById[realisation.voieId];
      const dateTimestamp = new Date(realisation.dateRealisation).getTime();
      const routeGrade = route?.cotationAjustee || route?.cotationReference;
      const routeGradeIndex = gradeToIndex(routeGrade);

      if (
        !route
        || routeGradeIndex < 0
        || !Number.isFinite(dateTimestamp)
        || dateTimestamp < cutoff
        || dateTimestamp > now
      ) return null;

      return {
        id: realisation.id,
        date: realisation.dateRealisation,
        grade: routeGrade,
        weightedIndex: routeGradeIndex * (STYLE_WEIGHTS[realisation.styleRealisation] || 1),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.weightedIndex - a.weightedIndex || b.date.localeCompare(a.date))
    .slice(0, 10);

  if (!bestRecent.length) {
    return { currentGrade: null, averageIndex: null, timeline: [] };
  }

  const averageIndex = bestRecent.reduce(
    (sum, item) => sum + item.weightedIndex,
    0,
  ) / bestRecent.length;

  return {
    currentGrade: indexToGrade(Math.round(averageIndex)),
    averageIndex,
    timeline: bestRecent,
  };
}

export function weightedMedian(values) {
  if (!values.length) return null;

  const sorted = [...values].sort(
    (a, b) => gradeToIndex(a.grade) - gradeToIndex(b.grade),
  );
  const total = sorted.reduce((sum, item) => sum + item.weight, 0);
  let cumulative = 0;

  for (const item of sorted) {
    cumulative += item.weight;
    if (cumulative >= total / 2) return item.grade;
  }

  return sorted.at(-1)?.grade || null;
}

export function calculateLeadRealisationStats(routes, realisations, routesById) {
  const routesByGrade = Object.fromEntries(GRADES.map((grade) => [grade, 0]));
  const leadsByGrade = Object.fromEntries(GRADES.map((grade) => [grade, 0]));

  routes.forEach((route) => {
    const routeGrade = route.cotationAjustee || route.cotationReference;
    if (Object.hasOwn(routesByGrade, routeGrade)) routesByGrade[routeGrade] += 1;
  });

  realisations
    .filter((realisation) => realisation.styleRealisation === "en_tete")
    .forEach((realisation) => {
      const route = routesById[realisation.voieId];
      const routeGrade = route?.cotationAjustee || route?.cotationReference;
      if (Object.hasOwn(leadsByGrade, routeGrade)) leadsByGrade[routeGrade] += 1;
    });

  return {
    total: realisations.filter(
      (realisation) => realisation.styleRealisation === "en_tete",
    ).length,
    byGrade: GRADES.map((grade) => {
      const routeCount = routesByGrade[grade];
      const leadCount = leadsByGrade[grade];
      return {
        grade,
        routeCount,
        leadCount,
        ratio: routeCount > 0 ? leadCount / routeCount : null,
      };
    }),
  };
}

export function calculateLeadPoints(participants, routes, realisations) {
  const points = Object.fromEntries(
    participants.map((participant) => [participant.id, 0]),
  );

  routes.forEach((route) => {
    const leadClimbers = new Set(
      realisations
        .filter((realisation) => (
          String(realisation.voieId) === String(route.id)
          && realisation.styleRealisation === "en_tete"
        ))
        .map((realisation) => String(realisation.participantId)),
    );

    if (!leadClimbers.size) return;
    const share = 1000 / leadClimbers.size;

    leadClimbers.forEach((participantId) => {
      points[participantId] = (points[participantId] || 0) + share;
    });
  });

  return points;
}

export function calculateRouteAggregates(
  routes,
  realisations,
  cprByParticipantId,
) {
  return Object.fromEntries(
    routes.map((route) => {
      const proposals = realisations
        .filter((realisation) => (
          String(realisation.voieId) === String(route.id)
          && realisation.cotationProposee
        ))
        .map((realisation) => {
          const cprIndex = cprByParticipantId[realisation.participantId]?.averageIndex;
          const normalizedCpr = Number.isFinite(cprIndex)
            ? Math.max(0, Math.min(GRADES.length - 1, cprIndex)) / (GRADES.length - 1)
            : 0;

          return {
            grade: realisation.cotationProposee,
            style: realisation.styleRealisation,
            consensusWeight: 1 + normalizedCpr,
          };
        })
        .filter((proposal) => gradeToIndex(proposal.grade) >= 0);

      const weightedProposals = proposals.map((proposal) => ({
        grade: proposal.grade,
        weight: STYLE_WEIGHTS[proposal.style] || 1,
      }));

      const distribution = GRADES
        .filter((grade) => proposals.some((proposal) => proposal.grade === grade))
        .map((grade) => ({
          grade,
          count: proposals.filter((proposal) => proposal.grade === grade).length,
        }));

      const averageIndex = proposals.length
        ? proposals.reduce((sum, proposal) => sum + gradeToIndex(proposal.grade), 0)
          / proposals.length
        : null;

      const medianGrade = proposals.length
        ? indexToGrade(
          proposals
            .map((proposal) => gradeToIndex(proposal.grade))
            .sort((a, b) => a - b)[Math.floor((proposals.length - 1) / 2)],
        )
        : null;

      const consensusWeightTotal = proposals.reduce(
        (sum, proposal) => sum + proposal.consensusWeight,
        0,
      );
      const consensusIndex = consensusWeightTotal
        ? proposals.reduce(
          (sum, proposal) => (
            sum + (gradeToIndex(proposal.grade) * proposal.consensusWeight)
          ),
          0,
        ) / consensusWeightTotal
        : null;

      return [route.id, {
        count: proposals.length,
        averageGrade: averageIndex === null
          ? null
          : indexToGrade(Math.round(averageIndex)),
        medianGrade,
        weightedMedianGrade: proposals.length >= 5
          ? weightedMedian(weightedProposals)
          : null,
        consensusGrade: consensusIndex === null
          ? null
          : indexToGrade(Math.round(consensusIndex)),
        consensusIndex,
        distribution,
      }];
    }),
  );
}

function fullName(participant) {
  return `${participant?.nom || ""} ${participant?.prenom || ""}`.trim();
}

function formatPoints(value) {
  return Number(value || 0).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
}

export function calculateWallOfFameCategories({
  participants,
  realisations,
  routesById,
  cprByParticipantId,
  pointsByParticipantId,
  participationCount,
}) {
  const successfulStyles = new Set([
    "a_vue", "flash", "en_tete", "moulinette", "travaillee",
  ]);

  const successfulRealisationsFor = (participantId) => realisations
    .filter((realisation) => String(realisation.participantId) === String(participantId))
    .filter((realisation) => successfulStyles.has(realisation.styleRealisation));

  const distinctRoutesFor = (participantId, predicate) => new Set(
    realisations
      .filter((realisation) => String(realisation.participantId) === String(participantId))
      .filter(predicate)
      .map((realisation) => String(realisation.voieId)),
  ).size;

  const sessionRouteSetsFor = (participantId) => {
    const groups = new Map();
    successfulRealisationsFor(participantId).forEach((realisation) => {
      const sessionKey = realisation.sessionId
        || String(realisation.dateRealisation || "").slice(0, 10);
      if (!sessionKey) return;
      if (!groups.has(sessionKey)) groups.set(sessionKey, new Set());
      groups.get(sessionKey).add(String(realisation.voieId));
    });
    return [...groups.values()];
  };

  const maxRoutesInSessionFor = (participantId) => {
    const routeSets = sessionRouteSetsFor(participantId);
    return routeSets.length
      ? Math.max(...routeSets.map((routeIds) => routeIds.size))
      : 0;
  };

  const maxDifficultyInSessionFor = (participantId) => (
    sessionRouteSetsFor(participantId).reduce((record, routeIds) => {
      const total = [...routeIds].reduce((sum, routeId) => {
        const route = routesById[routeId];
        const routeGrade = route?.cotationAjustee || route?.cotationReference;
        const gradeIndex = GRADES.indexOf(routeGrade);
        return sum + (gradeIndex >= 0 ? gradeIndex + 1 : 0);
      }, 0);
      return Math.max(record, total);
    }, 0)
  );

  const buildRanking = ({
    title,
    getValue,
    formatValue,
    isEligible = (value) => value > 0,
  }) => {
    const sorted = participants
      .map((participant) => ({ participant, value: getValue(participant) }))
      .filter((entry) => (
        Number.isFinite(entry.value)
        && isEligible(entry.value, entry.participant)
      ))
      .sort((a, b) => (
        b.value - a.value
        || fullName(a.participant).localeCompare(fullName(b.participant), "fr")
      ))
      .slice(0, 3);

    let previousValue = null;
    let previousRank = 0;

    return {
      title,
      entries: sorted.map((entry, index) => {
        const rank = previousValue !== null && entry.value === previousValue
          ? previousRank
          : index + 1;
        previousValue = entry.value;
        previousRank = rank;
        return {
          ...entry,
          rank,
          displayValue: formatValue(entry.value, entry.participant),
        };
      }),
    };
  };

  return [
    buildRanking({
      title: "Meilleurs CPR",
      getValue: (participant) => cprByParticipantId[participant.id]?.averageIndex,
      formatValue: (_value, participant) => (
        cprByParticipantId[participant.id]?.currentGrade || "nc"
      ),
      isEligible: (_value, participant) => Boolean(
        cprByParticipantId[participant.id]?.currentGrade,
      ),
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
      getValue: (participant) => distinctRoutesFor(
        participant.id,
        (realisation) => successfulStyles.has(realisation.styleRealisation),
      ),
      formatValue: (value) => `${value} voie${value > 1 ? "s" : ""}`,
    }),
    buildRanking({
      title: "Voies réalisées en tête",
      getValue: (participant) => distinctRoutesFor(
        participant.id,
        (realisation) => realisation.styleRealisation === "en_tete",
      ),
      formatValue: (value) => `${value} voie${value > 1 ? "s" : ""}`,
    }),
  ];
}
