import React from "react";
import { fullName, sortParticipantsCurrentUserFirst } from "../lib/domain.js";
import { buddyPreferenceKeyForSession } from "../lib/buddy-preferences.js";

export default function AvailableParticipantOptions({
  participants,
  currentParticipantId,
  session,
  preferencesByParticipantId,
}) {
  const sessionPreference = buddyPreferenceKeyForSession(session?.date, session?.slot);

  return sortParticipantsCurrentUserFirst(participants, currentParticipantId).map((participant) => {
    const hasDeclaredAvailability = Boolean(
      sessionPreference
      && (preferencesByParticipantId[String(participant.id)] || []).includes(sessionPreference)
    );

    return (
      <option
        key={participant.id}
        value={participant.id}
        style={hasDeclaredAvailability ? { textDecoration: "underline" } : undefined}
      >
        {fullName(participant)}
      </option>
    );
  });
}
