import { apiFetch } from "../lib/api.js";

const realisationSyncQueues = new Map();

export function useRealisationPersistence({
  useApi,
  authUser,
  state,
  setState,
  myParticipantId,
  sessionsById,
  onSuccess,
  onError,
}) {
  return async function updateRealisation(realisationId, patch) {
    const target = state.realisations.find((item) => String(item.id) === String(realisationId));
    if (!target || String(target.participantId) !== String(myParticipantId)) {
      onError?.("Erreur : vous pouvez modifier uniquement vos propres réalisations.");
      return;
    }

    const next = { ...target, ...patch };
    if (patch.sessionId) {
      const session = sessionsById[patch.sessionId];
      if (session) next.dateRealisation = `${session.date}T12:00:00`;
    }

    setState((previous) => ({
      ...previous,
      realisations: previous.realisations.map((realisation) => (
        String(realisation.id) === String(realisationId) ? next : realisation
      )),
    }));

    if (!useApi || !authUser) {
      onSuccess?.("Réalisation enregistrée.");
      return;
    }

    const queueKey = String(realisationId);
    const previousRequest = realisationSyncQueues.get(queueKey) || Promise.resolve();
    const request = previousRequest
      .catch(() => undefined)
      .then(() => apiFetch(`/realisations/${encodeURIComponent(realisationId)}`, {
        method: "PUT",
        body: JSON.stringify(patch),
      }));

    realisationSyncQueues.set(queueKey, request);
    try {
      await request;
      onSuccess?.("Réalisation enregistrée.");
    } catch (error) {
      setState((previous) => ({
        ...previous,
        realisations: previous.realisations.map((realisation) => (
          String(realisation.id) === String(realisationId) && realisation === next ? target : realisation
        )),
      }));
      onError?.(`Erreur mise à jour réalisation : ${error.message || error}`);
    } finally {
      if (realisationSyncQueues.get(queueKey) === request) realisationSyncQueues.delete(queueKey);
    }
  };
}
