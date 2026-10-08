import React from "react";
import Button from "./Button.jsx";
import AvailableParticipantOptions from "./AvailableParticipantOptions.jsx";
import {
  MAX_PARTICIPANTS,
  fullName,
  getPassportDotLabel,
  getPassportDotStyle,
  getPassportStyle,
  isLibreEligiblePassport,
  normalizePassport,
} from "../lib/domain.js";
import { hasBuddyAvailabilityForSession } from "../lib/buddy-preferences.js";
import { getSessionParticipantIds } from "../lib/realisation-workflow.js";
import {
  isQualifiedSessionSupervisor,
  isSessionManager,
  normalizeSessionRoles,
} from "../../../shared/session-rules.js";

export default function SessionCard({
  session,
  compact = false,
  participants,
  participantsById,
  alphabeticalParticipants,
  currentParticipantId,
  isAdmin = false,
  preferencesByParticipantId,
  onUpdate,
  onAddParticipant,
  onRemoveParticipant,
}) {
  const normalizedSession = normalizeSessionRoles(session);
  const sessionParticipantIds = getSessionParticipantIds(session);
  const inscrits = sessionParticipantIds
    .map((id) => participantsById[id])
    .filter(Boolean);
  const occupied = sessionParticipantIds.length;
  const missingSupervisor = (session.status === "encadree" && !session.encadrantId)
    || (session.status === "libre" && !session.referentId);
  const currentParticipant = participantsById[String(currentParticipantId || "")] || null;
  const canManageSession = isSessionManager(currentParticipant);
  const canManageSupervisor = Boolean(isAdmin || canManageSession);
  const availableParticipants = participants.filter((participant) => {
    const participantId = String(participant.id);
    return !sessionParticipantIds.includes(participantId)
      && occupied < MAX_PARTICIPANTS
      && (session.status !== "libre" || isLibreEligiblePassport(participant.passport));
  });
  const eligibleSupervisors = alphabeticalParticipants.filter((participant) =>
    isQualifiedSessionSupervisor(participant, session.status)
  );

  return (
    <div className={`card session-card session-status-${String(session.status || "fermee").trim().toLowerCase()} ${missingSupervisor ? "session-card-missing-supervisor" : ""} ${compact ? "session-card-compact" : ""}`}>
      <div className="card-header">
        <h3>Séance {session.slot}</h3>
        <span
          className="badge"
          style={{
            background: "rgba(255,255,255,.94)",
            color: "#0f172a",
            border: "1px solid rgba(15,23,42,.32)",
            fontWeight: 900,
            boxShadow: "0 1px 3px rgba(15,23,42,.18)",
          }}
        >
          {occupied}/{MAX_PARTICIPANTS}
        </span>
      </div>

      <div className="session-form-row">
        <div className="inline-field">
          <label>Statut</label>
          <select
            value={session.status}
            disabled={!canManageSession}
            title={canManageSession ? undefined : "Seuls les encadrants et référents peuvent changer le type de séance."}
            onChange={(event) => {
              const normalized = normalizeSessionRoles({
                ...session,
                status: event.target.value,
              });
              onUpdate(session.id, {
                status: normalized.status,
                encadrantId: normalized.encadrantId,
                referentId: normalized.referentId,
              });
            }}
          >
            <option value="fermee">Fermée</option>
            <option value="libre">Libre</option>
            <option value="encadree">Encadrée</option>
            <option value="passeport">Passeport</option>
            <option value="challenge">Challenge</option>
            <option value="renouvellement">Renouvellement</option>
          </select>
        </div>

        {session.status === "encadree" && (
          <div className="inline-field">
            <label>Encadrant</label>
            <select
              value={session.encadrantId || ""}
              disabled={!canManageSupervisor}
              onChange={(event) => onUpdate(session.id, { encadrantId: event.target.value || null })}
            >
              <option value="">Aucun</option>
              {eligibleSupervisors.map((participant) => (
                <option key={participant.id} value={participant.id}>{fullName(participant)}</option>
              ))}
            </select>
          </div>
        )}

        {session.status === "libre" && (
          <div className="inline-field">
            <label>RÉFÉRENT</label>
            <select
              value={session.referentId || ""}
              disabled={!canManageSupervisor}
              onChange={(event) => onUpdate(session.id, { referentId: event.target.value || null })}
            >
              <option value="">Aucun</option>
              {eligibleSupervisors.map((participant) => (
                <option key={participant.id} value={participant.id}>{fullName(participant)}</option>
              ))}
            </select>
          </div>
        )}

        <div className="inline-field add-participant-field">
          <label>Inscription</label>
          <select
            defaultValue=""
            disabled={availableParticipants.length === 0 || occupied >= MAX_PARTICIPANTS}
            onChange={(event) => {
              const participantId = event.currentTarget.value;
              if (!participantId) return;
              onAddParticipant(session.id, participantId);
              event.currentTarget.value = "";
            }}
          >
            <option value="">
              {availableParticipants.length === 0 ? "Aucune personne disponible" : "Inscrire un participant"}
            </option>
            <AvailableParticipantOptions
              participants={availableParticipants}
              currentParticipantId={currentParticipantId}
              session={session}
              preferencesByParticipantId={preferencesByParticipantId}
            />
          </select>
        </div>
      </div>

      <div className="stack session-participant-list">
        {inscrits.length === 0 ? (
          <div className="muted-box">Aucun inscrit.</div>
        ) : (
          inscrits.map((participant) => (
            <div
              className={`participant-row passport-row ${session.status === "libre" && normalizePassport(participant.passport) === "sans" ? "passport-warning-hatched" : ""}`}
              key={participant.id}
              style={{ ...getPassportStyle(participant), borderStyle: "solid" }}
              title={participant.cotisation ? "Cotisation payée" : "Cotisation non payée"}
              data-passport={normalizePassport(participant.passport)}
            >
              <span className="participant-identity">
                <span className="passport-dot" style={getPassportDotStyle(participant)} aria-hidden="true">
                  {getPassportDotLabel(participant)}
                </span>
                <span
                  className="participant-name"
                  style={hasBuddyAvailabilityForSession(preferencesByParticipantId, participant.id, session)
                    ? { textDecoration: "underline" }
                    : undefined}
                >
                  {fullName(participant)}
                </span>
              </span>
              <Button variant="remove" onClick={() => onRemoveParticipant(session.id, participant.id)} aria-label="Retirer">×</Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
