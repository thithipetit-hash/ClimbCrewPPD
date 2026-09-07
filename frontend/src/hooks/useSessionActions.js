import { apiFetch } from "../lib/api.js";
import { MAX_PARTICIPANTS, defaultSessionStatus } from "../lib/domain.js";

export function buildDefaultSession(sessionId, patch = {}) {
  const slot = sessionId.endsWith("-soir") ? "soir" : sessionId.endsWith("-matin") ? "matin" : "midi";
  const date = sessionId.slice(0, 10);
  return {
    id: sessionId,
    date,
    slot,
    status: defaultSessionStatus(date, slot),
    encadrantId: null,
    referentId: null,
    participantIds: [],
    ...patch,
  };
}

export function upsertSession(sessions, updatedSession) {
  const exists = sessions.some((session) => session.id === updatedSession.id);
  return exists
    ? sessions.map((session) => (session.id === updatedSession.id ? updatedSession : session))
    : [...sessions, updatedSession];
}

export function addParticipantToSessionValue(session, participantId) {
  const requestedId = String(participantId || "");
  if (!requestedId) return session;
  const currentParticipantIds = session.participantIds.map(String);
  const occupied = currentParticipantIds.length + (session.encadrantId ? 1 : 0) + (session.referentId ? 1 : 0);
  if (occupied >= MAX_PARTICIPANTS || currentParticipantIds.includes(requestedId)) return session;
  return { ...session, participantIds: [...currentParticipantIds, requestedId] };
}

export function removeParticipantFromSessionValue(session, participantId) {
  return {
    ...session,
    participantIds: session.participantIds.filter((id) => id !== participantId),
  };
}

export function useSessionActions({
  useApi,
  state,
  setState,
  setSyncMessage,
  setConfirmationMessage,
}) {
  function setSelectedDate(date) {
    setState((previous) => ({ ...previous, selectedDate: date }));
  }

  async function syncSessionToApi(session) {
    if (!useApi || !session) return;
    try {
      await apiFetch(`/sessions/${encodeURIComponent(session.id)}`, {
        method: "PUT",
        body: JSON.stringify(session),
      });
      setSyncMessage("Séance synchronisée via l’API");
      setConfirmationMessage("Séance enregistrée.");
    } catch (error) {
      setSyncMessage("Erreur synchronisation séance");
      console.error(error);
    }
  }

  function ensureSessionsForDate(date) {
    const createdSessions = [];
    setState((previous) => {
      const sessions = [...previous.sessions];
      ["midi", "soir", "matin"].forEach((slot) => {
        if (!sessions.some((session) => session.date === date && session.slot === slot)) {
          const session = buildDefaultSession(`${date}-${slot}`);
          sessions.push(session);
          createdSessions.push(session);
        }
      });
      return { ...previous, sessions };
    });
    if (useApi) createdSessions.forEach((session) => syncSessionToApi(session));
  }

  function updateSession(sessionId, patch) {
    const currentSession = state.sessions.find((session) => session.id === sessionId) || buildDefaultSession(sessionId);
    const updatedSession = { ...currentSession, ...patch };
    setState((previous) => ({ ...previous, sessions: upsertSession(previous.sessions, updatedSession) }));
    syncSessionToApi(updatedSession);
  }

  function addParticipantToSession(sessionId, participantId) {
    const currentSession = state.sessions.find((session) => session.id === sessionId) || buildDefaultSession(sessionId);
    const updatedSession = addParticipantToSessionValue(currentSession, participantId);
    if (updatedSession === currentSession) return;
    setState((previous) => ({ ...previous, sessions: upsertSession(previous.sessions, updatedSession) }));
    syncSessionToApi(updatedSession);
  }

  function removeParticipantFromSession(sessionId, participantId) {
    const currentSession = state.sessions.find((session) => session.id === sessionId) || buildDefaultSession(sessionId);
    const updatedSession = removeParticipantFromSessionValue(currentSession, participantId);
    setState((previous) => ({ ...previous, sessions: upsertSession(previous.sessions, updatedSession) }));
    syncSessionToApi(updatedSession);
  }

  return {
    setSelectedDate,
    ensureSessionsForDate,
    updateSession,
    addParticipantToSession,
    removeParticipantFromSession,
  };
}
