import { normalizeRealisationCriterion, normalizeRealisationMode } from "./realisation-mode.js";

export function isManagedSession(session) {
  if (["passeport", "challenge", "renouvellement"].includes(session?.status)) return true;
  return (session?.status === "encadree" && Boolean(session.encadrantId))
    || (session?.status === "libre" && Boolean(session.referentId));
}

export function getParticipantSessionDays(sessions, participantId) {
  if (!participantId) return [];
  return [...new Set((sessions || [])
    .filter(isManagedSession)
    .filter((session) => session.participantIds?.includes(participantId))
    .map((session) => session.date))]
    .sort((a, b) => b.localeCompare(a));
}

export function resolveSessionIdForRealisation(sessions, participantId, selectedDay) {
  if (!participantId || !selectedDay) return "";
  return (sessions || [])
    .filter((session) => session.date === selectedDay)
    .filter(isManagedSession)
    .filter((session) => session.participantIds?.includes(participantId))
    .sort((a, b) => a.slot.localeCompare(b.slot))[0]?.id || "";
}

export function buildRealisationDraft({ previous = {}, route = null, routeId = "", participantId = "", selectedDay = "", sessionId = "" } = {}) {
  return {
    ...previous,
    participantId,
    selectedDay,
    sessionId,
    voieId: routeId || "",
    modeRealisation: route?.moulinetteOnly
      ? "moulinette"
      : (normalizeRealisationMode(previous.modeRealisation) || "en_tete"),
    styleRealisation: normalizeRealisationCriterion(previous.styleRealisation) || "a_vue",
    cotationProposee: route?.cotationAjustee || route?.cotationReference || "",
    commentaire: "",
    rating: 0,
    chute: false,
    assureurId: "",
  };
}

export function buildRealisationPayload({ draft, sessionId, route = null, now = Date.now } = {}) {
  const rating = Number(draft?.rating || 0);
  return {
    id: `realisation-${now()}`,
    participantId: draft?.participantId || "",
    sessionId: sessionId || "",
    voieId: draft?.voieId || "",
    dateRealisation: `${draft?.selectedDay || ""}T12:00:00`,
    modeRealisation: route?.moulinetteOnly
      ? "moulinette"
      : (normalizeRealisationMode(draft?.modeRealisation) || "en_tete"),
    styleRealisation: normalizeRealisationCriterion(draft?.styleRealisation) || "a_vue",
    commentaire: draft?.commentaire || "",
    cotationProposee: draft?.cotationProposee || "",
    ...(Number.isInteger(rating) && rating >= 1 && rating <= 5 ? { rating } : {}),
    chute: Boolean(draft?.chute),
    assureurId: draft?.chute ? (draft?.assureurId || "") : "",
  };
}
