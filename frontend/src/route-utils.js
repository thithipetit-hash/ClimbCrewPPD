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
