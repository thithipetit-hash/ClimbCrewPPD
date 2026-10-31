import { apiFetch } from "../lib/api.js";
import { formatDateShortFr, formatRouteName } from "../lib/domain.js";

const realisationSyncQueues = new Map();

export function createRealisationPersistenceActions({
  useApi,
  authUser,
  state,
  setState,
  myParticipantId,
  routesById,
  requestConfirmation,
  onSuccess,
  onError,
  request = apiFetch,
}) {
  async function persistRealisationToApi(realisation) {
    if (!useApi) return realisation;
    if (!authUser) throw new Error("Connexion requise pour enregistrer une réalisation.");
    return await request("/realisations", {
      method: "POST",
      body: JSON.stringify(realisation),
    });
  }

  function deleteRealisation(realisation) {
    if (!realisation?.id) return;
    if (authUser?.role !== "admin" && String(realisation.participantId) !== String(myParticipantId)) {
      onError?.("Erreur : vous pouvez supprimer uniquement vos propres réalisations.");
      return;
    }

    const route = routesById[realisation.voieId];
    const routeLabel = route ? formatRouteName(route) : "la voie concernée";
    const dateLabel = realisation.dateRealisation
      ? formatDateShortFr(realisation.dateRealisation.slice(0, 10))
      : "date inconnue";

    requestConfirmation({
      title: "Supprimer la réalisation",
      message: `Supprimer définitivement la réalisation « ${routeLabel} » du ${dateLabel} ?`,
      onConfirm: async () => {
        const previousRealisations = state.realisations;
        setState((previous) => ({
          ...previous,
          realisations: previous.realisations.filter((item) => item.id !== realisation.id),
        }));

        try {
          if (useApi) {
            await request(`/realisations/${encodeURIComponent(realisation.id)}`, {
              method: "DELETE",
            });
          }
          onSuccess?.("Réalisation supprimée.");
        } catch (error) {
          setState((previous) => ({ ...previous, realisations: previousRealisations }));
          onError?.(`Erreur : suppression impossible : ${error.message || error}`);
        }
      },
    });
  }

  return { persistRealisationToApi, deleteRealisation };
}

export function useRealisationPersistence({
  useApi,
  authUser,
  state,
  setState,
  myParticipantId,
  sessionsById,
  onSuccess,
  onError,
  request = apiFetch,
}) {
  return async function updateRealisation(realisationId, patch) {
    const target = state.realisations.find((item) => String(item.id) === String(realisationId));
    if (!target || (authUser?.role !== "admin" && String(target.participantId) !== String(myParticipantId))) {
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
    const queuedRequest = previousRequest
      .catch(() => undefined)
      .then(() => request(`/realisations/${encodeURIComponent(realisationId)}`, {
        method: "PUT",
        body: JSON.stringify(patch),
      }));

    realisationSyncQueues.set(queueKey, queuedRequest);
    try {
      await queuedRequest;
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
      if (realisationSyncQueues.get(queueKey) === queuedRequest) realisationSyncQueues.delete(queueKey);
    }
  };
}
