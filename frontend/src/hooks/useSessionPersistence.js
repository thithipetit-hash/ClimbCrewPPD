import { apiFetch } from "../lib/api.js";

const sessionSyncQueues = new Map();

export function useSessionPersistence({ useApi, setState, onSuccess, onError }) {
  async function syncSessionToApi(session) {
    if (!useApi || !session) return true;

    const sessionId = String(session.id);
    const previousRequest = sessionSyncQueues.get(sessionId) || Promise.resolve();
    const request = previousRequest
      .catch(() => undefined)
      .then(() => apiFetch(`/sessions/${encodeURIComponent(session.id)}`, {
        method: "PUT",
        body: JSON.stringify(session),
      }));

    sessionSyncQueues.set(sessionId, request);
    try {
      await request;
      onSuccess?.("Séance enregistrée.");
      return true;
    } catch (error) {
      onError?.(`Erreur synchronisation séance : ${error.message || error}`);
      return false;
    } finally {
      if (sessionSyncQueues.get(sessionId) === request) sessionSyncQueues.delete(sessionId);
    }
  }

  function persistSessionChange(sessionId, previousSession, updatedSession, existed) {
    setState((previous) => ({
      ...previous,
      sessions: existed
        ? previous.sessions.map((session) => (session.id === sessionId ? updatedSession : session))
        : [...previous.sessions, updatedSession],
    }));

    void syncSessionToApi(updatedSession).then((saved) => {
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
