// La FFME classe les grimpeurs selon l'âge atteint dans l'année civile
// qui commence au cours de la saison sportive (septembre à août).
export const FFME_ADULT_CATEGORIES = Object.freeze([
  "U19", "U21", "Sénior", "Vétéran 1", "Vétéran 2",
]);

export function getFfmeSeasonYear(date = new Date()) {
  const year = date.getUTCFullYear();
  return year + (date.getUTCMonth() >= 8 ? 1 : 0);
}

export function getFfmeAgeCategory(birthYear, seasonYear = getFfmeSeasonYear()) {
  if (birthYear === "" || birthYear === null || birthYear === undefined) return "";
  const year = Number(birthYear);
  if (!Number.isInteger(year) || year < 1900 || !Number.isInteger(seasonYear)) return "";

  const age = seasonYear - year;
  if (age < 17) return "";
  if (age <= 18) return "U19";
  if (age <= 20) return "U21";
  if (age <= 39) return "Sénior";
  if (age <= 49) return "Vétéran 1";
  return "Vétéran 2";
}
