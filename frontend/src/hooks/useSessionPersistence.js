import { apiFetch } from "../lib/api.js";

const sessionSyncQueues = new Map();
const SESSION_METADATA_FIELDS = Object.freeze([
  "date",
  "slot",
  "status",
  "encadrantId",
  "referentId",
]);

function normalizedParticipantIds(session) {
  return [...new Set((session?.participantIds || []).map(String))];
}

export function getSessionParticipantChanges(previousSession, updatedSession) {
  const previousIds = normalizedParticipantIds(previousSession);
  const updatedIds = normalizedParticipantIds(updatedSession);
  const previous = new Set(previousIds);
  const updated = new Set(updatedIds);

  return {
    added: updatedIds.filter((participantId) => !previous.has(participantId)),
    removed: previousIds.filter((participantId) => !updated.has(participantId)),
  };
}

export function hasSessionMetadataChanges(previousSession, updatedSession) {
  if (!previousSession) return true;
  return SESSION_METADATA_FIELDS.some(
    (field) => (previousSession?.[field] ?? null) !== (updatedSession?.[field] ?? null),
  );
}

function participantRegistrationPath(sessionId, participantId) {
  return `/sessions/${encodeURIComponent(sessionId)}/participants/${encodeURIComponent(participantId)}`;
}

export function useSessionPersistence({ useApi, setState, onSuccess, onError, request = apiFetch }) {
  async function performSessionSync(previousSession, session, existed) {
    const { added, removed } = getSessionParticipantChanges(previousSession, session);

    const hasParticipantChanges = added.length > 0 || removed.length > 0;
    if (!hasParticipantChanges || hasSessionMetadataChanges(previousSession, session)) {
      await request(`/sessions/${encodeURIComponent(session.id)}`, {
        method: "PUT",
        body: JSON.stringify({
          ...session,
          participantIds: [],
          participantMode: "preserve",
        }),
      });
    }

    for (const participantId of removed) {
      await request(participantRegistrationPath(session.id, participantId), {
        method: "DELETE",
      });
    }

    for (const participantId of added) {
      await request(participantRegistrationPath(session.id, participantId), {
        method: "POST",
        body: JSON.stringify({
          session: { ...session, participantIds: [] },
        }),
      });
    }
  }

  async function syncSessionToApi(session, { previousSession = null, existed = true } = {}) {
    if (!useApi || !session) return true;

    const sessionId = String(session.id);
    const previousRequest = sessionSyncQueues.get(sessionId) || Promise.resolve();
    const queuedRequest = previousRequest
      .catch(() => undefined)
      .then(() => performSessionSync(previousSession, session, existed));

    sessionSyncQueues.set(sessionId, queuedRequest);
    try {
      await queuedRequest;
      onSuccess?.("Séance enregistrée.");
      return true;
    } catch (error) {
      onError?.(`Erreur synchronisation séance : ${error.message || error}`);
      return false;
    } finally {
      if (sessionSyncQueues.get(sessionId) === queuedRequest) sessionSyncQueues.delete(sessionId);
    }
  }

  function persistSessionChange(sessionId, previousSession, updatedSession, existed) {
    setState((previous) => ({
      ...previous,
      sessions: existed
        ? previous.sessions.map((session) => (session.id === sessionId ? updatedSession : session))
        : [...previous.sessions, updatedSession],
    }));

    return syncSessionToApi(updatedSession, { previousSession, existed }).then((saved) => {
      if (saved) return;
      setState((previous) => {
        const current = previous.sessions.find((session) => session.id === sessionId);
        if (current !== updatedSession) return previous;
        return {
          ...previous,
          sessions: existed
            ? previous.sessions.map((session) => (session.id === sessionId ? previousSession : session))
            : previous.sessions.filter((session) => session.id !== sessionId),
        };
      });
    });
  }

  return { syncSessionToApi, persistSessionChange };
}
