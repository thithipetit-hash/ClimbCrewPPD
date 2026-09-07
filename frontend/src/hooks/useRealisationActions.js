import { apiFetch } from "../lib/api.js";
import { formatDateShortFr, formatRouteName } from "../lib/domain.js";
import {
  buildRealisationDraft,
  buildRealisationPayload,
  getParticipantSessionDays,
  resolveSessionIdForRealisation,
} from "../lib/realisation-workflow.js";

export function useRealisationActions({
  useApi,
  authUser,
  state,
  setState,
  myParticipantId,
  sessionsById,
  routesById,
  participantsById,
  newRealisation,
  setNewRealisation,
  setRealisationModalRouteId,
  setConfirmationMessage,
}) {
  function getParticipantSessions(participantId) {
    if (!participantId) return [];
    return state.sessions
      .filter((session) => session.participantIds?.includes(participantId))
      .sort((a, b) => {
        const dateCompare = b.date.localeCompare(a.date);
        return dateCompare !== 0 ? dateCompare : a.slot.localeCompare(b.slot);
      });
  }

  async function updateRealisationInApi(realisationId, patch) {
    if (!useApi || !authUser) return;
    await apiFetch(`/realisations/${realisationId}`, {
      method: "PUT",
      body: JSON.stringify(patch),
    });
  }

  async function syncRealisationPatch(realisationId, patch) {
    try {
      await updateRealisationInApi(realisationId, patch);
    } catch (error) {
      console.error(error);
    }
  }

  function updateRealisation(realisationId, patch) {
    const target = state.realisations.find((item) => String(item.id) === String(realisationId));
    if (!target || String(target.participantId) !== String(myParticipantId)) {
      alert("Vous pouvez modifier uniquement vos propres réalisations.");
      return;
    }
    syncRealisationPatch(realisationId, patch);
    setState((previous) => ({
      ...previous,
      realisations: previous.realisations.map((realisation) => {
        if (realisation.id !== realisationId) return realisation;
        const next = { ...realisation, ...patch };
        if (patch.sessionId) {
          const session = sessionsById[patch.sessionId];
          if (session) next.dateRealisation = `${session.date}T12:00:00`;
        }
        return next;
      }),
    }));
  }

  function openRealisationModal(routeId, requestedParticipantId = "") {
    const route = routesById[routeId];
    requestedParticipantId = myParticipantId || "";
    const requestedParticipant = participantsById[requestedParticipantId];
    const latestRegisteredDay = requestedParticipant?.cotisation
      ? getParticipantSessionDays(state.sessions, requestedParticipantId)[0] || ""
      : "";
    const defaultParticipantId = latestRegisteredDay ? requestedParticipantId : "";

    setNewRealisation((previous) => buildRealisationDraft({
      previous,
      route,
      routeId,
      participantId: defaultParticipantId,
      selectedDay: latestRegisteredDay,
      sessionId: defaultParticipantId && latestRegisteredDay
        ? resolveSessionIdForRealisation(state.sessions, defaultParticipantId, latestRegisteredDay)
        : "",
    }));
    setRealisationModalRouteId(routeId || "");
  }

  function closeRealisationModal() {
    setRealisationModalRouteId(null);
  }

  async function persistRealisationToApi(realisation) {
    if (!useApi) return realisation;
    if (!authUser) throw new Error("Connexion requise pour enregistrer une réalisation.");
    return apiFetch("/realisations", {
      method: "POST",
      body: JSON.stringify(realisation),
    });
  }

  async function deleteRealisation(realisation) {
    if (!realisation?.id) return;
    if (String(realisation.participantId) !== String(myParticipantId)) {
      alert("Vous pouvez supprimer uniquement vos propres réalisations.");
      return;
    }

    const route = routesById[realisation.voieId];
    const routeLabel = route ? formatRouteName(route) : "la voie concernée";
    const dateLabel = realisation.dateRealisation
      ? formatDateShortFr(realisation.dateRealisation.slice(0, 10))
      : "date inconnue";
    if (!window.confirm(`Supprimer définitivement la réalisation « ${routeLabel} » du ${dateLabel} ?`)) return;

    const previousRealisations = state.realisations;
    setState((previous) => ({
      ...previous,
      realisations: previous.realisations.filter((item) => item.id !== realisation.id),
    }));

    try {
      if (useApi) {
        await apiFetch(`/realisations/${encodeURIComponent(realisation.id)}`, { method: "DELETE" });
      }
      setConfirmationMessage("Réalisation supprimée.");
    } catch (error) {
      setState((previous) => ({ ...previous, realisations: previousRealisations }));
      alert(`Suppression impossible : ${error.message || error}`);
    }
  }

  async function addRealisation() {
    if (!myParticipantId || String(newRealisation.participantId) !== String(myParticipantId)) {
      alert("Vous pouvez enregistrer uniquement vos propres réalisations.");
      return;
    }
    if (!newRealisation.participantId || !newRealisation.selectedDay || !newRealisation.voieId) {
      alert("Sélectionne un jour, un participant et une voie.");
      return;
    }

    const participant = participantsById[newRealisation.participantId];
    if (!participant?.cotisation) {
      alert("Le participant doit avoir payé sa cotisation pour enregistrer une réalisation.");
      return;
    }

    const sessionId = resolveSessionIdForRealisation(
      state.sessions,
      newRealisation.participantId,
      newRealisation.selectedDay,
    );
    if (!sessionId) {
      alert("Le participant doit être inscrit à au moins une séance ce jour-là pour enregistrer une réalisation.");
      return;
    }

    const realisation = buildRealisationPayload({
      draft: newRealisation,
      sessionId,
      route: routesById[newRealisation.voieId],
    });

    try {
      const savedRealisation = await persistRealisationToApi(realisation);
      setState((previous) => ({
        ...previous,
        realisations: [...previous.realisations, savedRealisation || realisation],
      }));
      setNewRealisation((previous) => ({
        ...previous,
        participantId: "",
        selectedDay: "",
        sessionId: "",
        commentaire: "",
        cotationProposee: "",
        rating: 0,
        chute: false,
        assureurId: "",
      }));
      setRealisationModalRouteId(null);
      setConfirmationMessage("Réalisation enregistrée.");
    } catch (error) {
      alert(String(error.message || error));
    }
  }

  return {
    getParticipantSessions,
    updateRealisation,
    openRealisationModal,
    closeRealisationModal,
    deleteRealisation,
    addRealisation,
  };
}
