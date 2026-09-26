import { fullName } from "./domain.js";

function safeCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? count : 0;
}

export function buildKudoRanking({
  participants = [],
  stats = [],
  metric = "received",
} = {}) {
  const countKey = metric === "given" ? "givenCount" : "receivedCount";
  const statsByParticipantId = new Map(
    (Array.isArray(stats) ? stats : []).map((item) => [String(item.participantId), item]),
  );

  const sorted = (Array.isArray(participants) ? participants : [])
    .map((participant) => ({
      participant,
      value: safeCount(statsByParticipantId.get(String(participant.id))?.[countKey]),
    }))
    .sort((left, right) => (
      right.value - left.value
      || fullName(left.participant).localeCompare(fullName(right.participant), "fr")
    ));

  let previousValue = null;
  let previousRank = 0;
  const qualifier = metric === "given" ? "donné" : "reçu";

  return sorted.map((entry, index) => {
    const rank = previousValue !== null && entry.value === previousValue
      ? previousRank
      : index + 1;
    previousValue = entry.value;
    previousRank = rank;
    return {
      ...entry,
      rank,
      displayValue: `${entry.value} Kudo${entry.value > 1 ? "s" : ""} ${qualifier}${entry.value > 1 ? "s" : ""}`,
    };
  });
}
