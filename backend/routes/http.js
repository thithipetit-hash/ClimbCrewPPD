// Réponse d'erreur commune à tous les routeurs métier.
export function sendRouteError(res, error, fallbackMessage = "Erreur interne") {
  res.status(error.status || 500).json({
    error: error.message || fallbackMessage,
    fields: error.fields || undefined,
  });
}
