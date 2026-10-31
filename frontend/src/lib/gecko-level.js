import { GRADES } from "../../../shared/climbing-grades.js";

// Les seuils sont inclusifs : le niveau 8 est acquis dès 7a.
const LEVEL_START_GRADES = ["4", "5a", "5c", "6a", "6b", "6c", "6c+", "7a"];
const LEVEL_START_INDICES = LEVEL_START_GRADES.map((grade) => GRADES.indexOf(grade));

export const GECKO_LEVEL_LABELS = Object.freeze([
  "Découverte", "Initiation", "Autonome", "Confirmé",
  "Technique", "Expert", "Maître", "Élite",
]);

const LEVEL_LABELS = {
  neutral: GECKO_LEVEL_LABELS,
  feminine: ["Découverte", "Initiation", "Autonome", "Confirmée", "Technique", "Experte", "Maîtresse", "Élite"],
};

export function getGeckoLevel(grade) {
  const gradeIndex = GRADES.indexOf(String(grade || "").trim().toLowerCase());
  if (gradeIndex < 0) return 1;

  for (let index = LEVEL_START_INDICES.length - 1; index >= 0; index -= 1) {
    if (gradeIndex >= LEVEL_START_INDICES[index]) return index + 1;
  }
  return 1;
}

export function getGeckoVariant(sexe) {
  return String(sexe || "").trim().toUpperCase() === "F" ? "feminine" : "neutral";
}

export function getGeckoLevelLabel(level, sexe) {
  const safeLevel = Math.min(8, Math.max(1, Number(level) || 1));
  const variant = getGeckoVariant(sexe);
  return LEVEL_LABELS[variant][safeLevel - 1];
}

export function getGeckoLevelInfo(grade, sexe) {
  const level = getGeckoLevel(grade);
  return {
    level,
    variant: getGeckoVariant(sexe),
    label: getGeckoLevelLabel(level, sexe),
  };
}
