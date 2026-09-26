import React from "react";
import { fullName, sortParticipantsCurrentUserFirst } from "../lib/domain.js";
import { hasBuddyAvailabilityForSession } from "../lib/buddy-preferences.js";

export default function AvailableParticipantOptions({
  participants,
  currentParticipantId,
  session,
  preferencesByParticipantId,
}) {
  return sortParticipantsCurrentUserFirst(participants, currentParticipantId).map((participant) => {
    const hasDeclaredAvailability = hasBuddyAvailabilityForSession(
      preferencesByParticipantId,
      participant.id,
      session,
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
