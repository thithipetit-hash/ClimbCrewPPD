import { getRealisationCriterion, getRealisationMode } from "./realisation-mode.js";
import { normalizeRopeNumber, fullName } from "./domain.js";
import { ROUTE_TAGS } from "./ui-config.js";
import { buildCsv, csvFileSlug } from "./csv.js";

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


export function buildTheCragExport({ participant, realisations = [], routesById = {}, startDate = "" }) {
  const normalizedStartDate = String(startDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedStartDate)) {
    throw new Error("Choisissez une date de début valide pour l’export theCrag.");
  }

  const headers = ["country", "crag", "sector", "route", "grade", "date", "style", "comment"];
  const rows = [...realisations]
    .filter((realisation) => String(realisation.dateRealisation || "").slice(0, 10) >= normalizedStartDate)
    .sort((a, b) => String(a.dateRealisation || "").localeCompare(String(b.dateRealisation || "")))
    .map((realisation) => {
      const route = routesById[realisation.voieId];
      const ropeNumber = route ? normalizeRopeNumber(route.numeroCorde) : 0;
      const routeName = route?.nomVoie?.trim() || `Voie corde ${ropeNumber}`;
      const details = [
        route?.nomOuvreur ? `Ouvreur : ${route.nomOuvreur}` : "",
        route?.couleurPrises ? `Couleur : ${route.couleurPrises}` : "",
        realisation.cotationProposee ? `Cotation proposée : ${realisation.cotationProposee}` : "",
        route?.tags?.length ? `Caractéristiques : ${route.tags.map((tag) => ROUTE_TAGS.find((item) => item.value === tag)?.label || tag).join(", ")}` : "",
        realisation.commentaire || "",
      ].filter(Boolean).join(" · ");
      return [
        "France",
        "ASTC",
        `Corde ${ropeNumber}`,
        routeName,
        route?.cotationAjustee || route?.cotationReference || "",
        realisation.dateRealisation?.slice(0, 10) || "",
        theCragStyleForRealisation(realisation, route),
        details,
      ];
    });

  return {
    startDate: normalizedStartDate,
    count: rows.length,
    filename: `thecrag-${csvFileSlug(fullName(participant))}-depuis-${normalizedStartDate}.csv`,
    csv: buildCsv(headers, rows),
  };
}
