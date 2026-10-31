import { getFfmeAgeCategory } from "../../../shared/ffme-age-categories.js";

export const UNSPECIFIED_FFME_CATEGORY = "non-renseignee";

export function filterWallOfFameParticipants(participants, { sex = "all", ageCategory = "all" } = {}) {
  return participants.filter((participant) => {
    if (sex !== "all" && participant.sexe !== sex) return false;
    if (ageCategory === "all") return true;

    const participantAgeCategory = getFfmeAgeCategory(participant.anneeNaissance);
    return ageCategory === UNSPECIFIED_FFME_CATEGORY
      ? !participantAgeCategory
      : participantAgeCategory === ageCategory;
  });
}
