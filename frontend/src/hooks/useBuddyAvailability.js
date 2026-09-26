import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api.js";
import { buddyPreferencesFromAvailability } from "../lib/buddy-preferences.js";

export function useBuddyAvailability({ useApi, authUser, active }) {
  const [preferencesByParticipantId, setPreferencesByParticipantId] = useState({});

  useEffect(() => {
    if (!useApi || !authUser || !active) return undefined;

    let cancelled = false;

    async function loadBuddyPreferences() {
      try {
        const otherAvailabilities = await apiFetch("/buddy");
        let ownAvailability = null;

        if (authUser.participantId) {
          ownAvailability = await apiFetch("/buddy/me");
        }

        if (cancelled) return;

        const nextPreferences = {};
        for (const availability of Array.isArray(otherAvailabilities) ? otherAvailabilities : []) {
          const participantId = String(availability?.participantId || "");
          if (participantId) {
            nextPreferences[participantId] = buddyPreferencesFromAvailability(availability);
          }
        }

        const ownParticipantId = String(authUser.participantId || "");
        if (ownParticipantId && ownAvailability) {
          nextPreferences[ownParticipantId] = buddyPreferencesFromAvailability(ownAvailability);
        }

        setPreferencesByParticipantId(nextPreferences);
      } catch (error) {
        console.error("Impossible de charger les disponibilités Buddy pour le planning.", error);
        if (!cancelled) setPreferencesByParticipantId({});
      }
    }

    loadBuddyPreferences();
    return () => {
      cancelled = true;
    };
  }, [useApi, active, authUser?.id, authUser?.participantId]);

  return preferencesByParticipantId;
}
