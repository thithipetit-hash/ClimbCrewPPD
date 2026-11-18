export const MAX_SESSION_PARTICIPANTS = 18;

function normalizeSessionPersonId(value) {
  return value === null || value === undefined || value === "" ? null : String(value);
}

export function isSessionManager(participant = null) {
  return Boolean(participant?.canEncadrer || participant?.canReferer);
}

export function getSessionSupervisorRole(status) {
  const normalizedStatus = String(status || "").trim().toLowerCase();
  if (normalizedStatus === "libre") return "referent";
  if (normalizedStatus === "encadree") return "encadrant";
  return null;
}

export function isQualifiedSessionSupervisor(participant, status) {
  const role = getSessionSupervisorRole(status);
  if (role === "referent") return Boolean(participant?.canReferer);
  if (role === "encadrant") return Boolean(participant?.canEncadrer);
  return false;
}

export function normalizeSessionRoles(session) {
  const role = getSessionSupervisorRole(session?.status);
  return {
    ...session,
    encadrantId: role === "encadrant"
      ? normalizeSessionPersonId(session?.encadrantId ?? session?.encadrant_id)
      : null,
    referentId: role === "referent"
      ? normalizeSessionPersonId(session?.referentId ?? session?.referent_id)
      : null,
  };
}

export function getSessionAttendanceIds(session) {
  const participantIds = (session?.participantIds || []).map(String);
  const role = getSessionSupervisorRole(session?.status);
  const supervisorId = role === "encadrant"
    ? normalizeSessionPersonId(session?.encadrantId ?? session?.encadrant_id)
    : role === "referent"
      ? normalizeSessionPersonId(session?.referentId ?? session?.referent_id)
      : null;

  return [...new Set([...participantIds, supervisorId].filter(Boolean))];
}
