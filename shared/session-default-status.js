/**
 * Règle métier partagée du statut par défaut d'une séance.
 *
 * - mardi midi et jeudi midi : séance encadrée ;
 * - tous les autres créneaux : séance libre.
 *
 * Ce module est volontairement indépendant de React, Express et PostgreSQL afin
 * d'être utilisable par le frontend et le backend sans créer de dépendance entre
 * leurs arborescences respectives.
 */
export function getDefaultSessionStatus(date, slot) {
  const day = new Date(`${date}T12:00:00`).getDay();
  return slot === "midi" && (day === 2 || day === 4) ? "encadree" : "libre";
}
