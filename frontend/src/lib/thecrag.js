import { getRealisationCriterion, getRealisationMode } from "./realisation-mode.js";

const STYLE_BY_CRITERION = {
  a_vue: "Onsight",
  flash: "Flash",
  travaillee: "Redpoint",
  avec_repos: "Dog",
  projet: "Attempt",
  non_enchainee: "Attempt",
  test: "Attempt",
};

export function theCragStyleForRealisation(realisation, route = null) {
  if (getRealisationMode(realisation, route) === "moulinette") return "Top rope";
  const criterion = getRealisationCriterion(realisation);
  if (criterion) return STYLE_BY_CRITERION[criterion] || "Attempt";
  const legacyStyle = String(realisation?.styleRealisation || realisation?.style_realisation || "");
  if (legacyStyle === "moulinette") return "Top rope";
  if (legacyStyle === "en_tete") return "Redpoint";
  return "Attempt";
}
