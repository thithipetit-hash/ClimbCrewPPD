import { apiFetch } from "./api.js";

/** Rétablit l'historique du CPR puis recharge toutes les données utiles aux statistiques. */
export async function recalculateOwnStatisticsAndCpr({
  participantId,
  reloadApiState,
  request = apiFetch,
}) {
  if (!participantId) throw new Error("Votre compte n'est pas associé à un grimpeur.");
  const result = await request("/participants/me/statistics/recalculate", { method: "POST" });
  if (result?.ok !== true || result.cprResetAt !== null) {
    throw new Error("La confirmation serveur est manquante.");
  }
  const refreshed = await reloadApiState({ requireComplete: true });
  if (!refreshed?.participants?.some((participant) => (
    String(participant.id) === String(participantId) && !participant.cprResetAt
  ))) {
    throw new Error("Le CPR recalculé n'a pas pu être confirmé. Actualisez la page.");
  }
}
