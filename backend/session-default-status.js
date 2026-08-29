/**
 * Règle métier canonique du statut par défaut d'une séance.
 *
 * - mardi midi et jeudi midi : séance encadrée ;
 * - tous les autres créneaux : séance libre.
 */
export function getDefaultSessionStatus(date, slot) {
  const day = new Date(`${date}T12:00:00`).getDay();
  return slot === "midi" && (day === 2 || day === 4) ? "encadree" : "libre";
}
