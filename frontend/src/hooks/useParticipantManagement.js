import { apiFetch } from "../lib/api.js";
import { fullName } from "../lib/domain.js";
import { getSessionParticipantIds } from "../lib/realisation-workflow.js";

const EMPTY_PARTICIPANT_DRAFT = {
  nom: "",
  prenom: "",
  email: "",
  passport: "sans",
  passportDecouverte: false,
  passeportFfme: false,
  sexe: "",
  anneeNaissance: null,
  cotisation: false,
  ffme: false,
  canEncadrer: false,
  canReferer: false,
  canAdmin: false,
};

export function useParticipantManagement({
  useApi,
  state,
  setState,
  newParticipant,
  setNewParticipant,
  myParticipant,
  myParticipantId,
  setIsSyncing,
  setRecentlyAddedParticipantIds,
  setSyncMessage,
  setConfirmationMessage,
  requestConfirmation,
}) {
  async function addParticipant() {
    if (!newParticipant.nom.trim() || !newParticipant.prenom.trim()) return;
    const participant = {
      ...newParticipant,
      nom: newParticipant.nom.trim(),
      prenom: newParticipant.prenom.trim(),
    };

    try {
      setIsSyncing(true);
      const created = useApi
        ? await apiFetch("/participants", {
          method: "POST",
          body: JSON.stringify(participant),
        })
        : { ...participant, id: `p-${Date.now()}` };

      setState((previous) => ({
        ...previous,
        participants: [created, ...previous.participants],
      }));
      setRecentlyAddedParticipantIds((previous) => [
        String(created.id),
        ...previous.filter((id) => String(id) !== String(created.id)),
      ]);
      setNewParticipant({ ...EMPTY_PARTICIPANT_DRAFT });
      setSyncMessage(useApi ? "Participant ajouté via l’API" : "");
      setConfirmationMessage("Participant ajouté.");
      return created;
    } catch (error) {
      setSyncMessage(`Erreur ajout participant : ${error.message || error}`);
      console.error(error);
      throw error;
    } finally {
      setIsSyncing(false);
    }
  }

  async function updateParticipant(id, patch) {
    const previousParticipant = state.participants.find(
      (participant) => String(participant.id) === String(id),
    );
    if (!previousParticipant) throw new Error("Participant introuvable.");

    const optimistic = { ...previousParticipant, ...patch };
    setState((previous) => ({
      ...previous,
      participants: previous.participants.map((participant) => (
        String(participant.id) === String(id) ? optimistic : participant
      )),
    }));

    if (!useApi) {
      setConfirmationMessage("Participant enregistré.");
      return optimistic;
    }

    try {
      const updated = await apiFetch(`/participants/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(optimistic),
      });
      setState((previous) => ({
        ...previous,
        participants: previous.participants.map((participant) => (
          String(participant.id) === String(id) ? updated : participant
        )),
      }));
      setConfirmationMessage("Participant enregistré.");
      return updated;
    } catch (error) {
      setState((previous) => ({
        ...previous,
        participants: previous.participants.map((participant) => (
          String(participant.id) === String(id) ? previousParticipant : participant
        )),
      }));
      setSyncMessage(`Erreur mise à jour participant : ${error.message || error}`);
      console.error(error);
      throw error;
    }
  }

  async function updateMyProfile(patch) {
    if (!myParticipant || !useApi) return null;
    const previousParticipant = myParticipant;
    const optimistic = { ...previousParticipant, ...patch };
    setState((previous) => ({
      ...previous,
      participants: previous.participants.map((participant) => (
        String(participant.id) === String(myParticipantId) ? optimistic : participant
      )),
    }));

    try {
      const updated = await apiFetch("/participants/me/profile", {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setState((previous) => ({
        ...previous,
        participants: previous.participants.map((participant) => (
          String(participant.id) === String(myParticipantId) ? updated : participant
        )),
      }));
      setConfirmationMessage("Préférences du profil enregistrées.");
      return updated;
    } catch (error) {
      setState((previous) => ({
        ...previous,
        participants: previous.participants.map((participant) => (
          String(participant.id) === String(myParticipantId) ? previousParticipant : participant
        )),
      }));
      setSyncMessage("Erreur d’enregistrement du profil");
      console.error(error);
      throw error;
    }
  }

  function applyParticipantDeletion(id) {
    const removedId = String(id);
    setState((previous) => ({
      ...previous,
      participants: previous.participants.filter(
        (participant) => String(participant.id) !== removedId,
      ),
      sessions: previous.sessions.map((session) => ({
        ...session,
        participantIds: session.participantIds.filter(
          (participantId) => String(participantId) !== removedId,
        ),
        encadrantId: String(session.encadrantId || "") === removedId ? null : session.encadrantId,
        referentId: String(session.referentId || "") === removedId ? null : session.referentId,
      })),
      realisations: previous.realisations.filter(
        (realisation) => String(realisation.participantId) !== removedId,
      ),
    }));
    setRecentlyAddedParticipantIds((previous) => previous.filter(
      (participantId) => String(participantId) !== removedId,
    ));
  }

  async function deleteParticipant(id) {
    const participant = state.participants.find(
      (item) => String(item.id) === String(id),
    );
    if (!participant) return;

    const relatedRealisations = state.realisations.filter(
      (item) => String(item.participantId) === String(id),
    ).length;
    const relatedInscriptions = state.sessions.reduce(
      (count, session) => count + session.participantIds.filter(
        (participantId) => String(participantId) === String(id),
      ).length,
      0,
    );
    const warning = relatedInscriptions || relatedRealisations
      ? ` Cette action supprimera aussi ${relatedInscriptions} inscription(s) et ${relatedRealisations} réalisation(s).`
      : "";

    requestConfirmation({
      title: "Supprimer le grimpeur",
      message: `Supprimer définitivement le grimpeur ${fullName(participant)} ?${warning}`,
      onConfirm: async () => {
        if (!useApi) {
          applyParticipantDeletion(id);
          setConfirmationMessage("Grimpeur supprimé.");
          return;
        }

        try {
          setIsSyncing(true);
          // Une suppression destructive n'est jamais optimiste : l'état local
          // ne change qu'après validation transactionnelle du serveur.
          await apiFetch(`/participants/${encodeURIComponent(id)}`, { method: "DELETE" });
          applyParticipantDeletion(id);
          setSyncMessage("Participant supprimé via l’API");
          setConfirmationMessage("Grimpeur supprimé.");
        } catch (error) {
          setSyncMessage(`Erreur suppression participant : ${error.message || error}`);
          console.error(error);
        } finally {
          setIsSyncing(false);
        }
      },
    });
  }

  function getParticipantSessions(participantId) {
    if (!participantId) return [];

    return state.sessions
      .filter((session) => getSessionParticipantIds(session).includes(String(participantId)))
      .sort((left, right) => {
        const dateCompare = right.date.localeCompare(left.date);
        if (dateCompare !== 0) return dateCompare;
        return left.slot.localeCompare(right.slot);
      });
  }

  return {
    addParticipant,
    updateParticipant,
    updateMyProfile,
    deleteParticipant,
    getParticipantSessions,
  };
}
