import assert from "node:assert/strict";
import test from "node:test";
import { useParticipantManagement } from "./useParticipantManagement.js";

test("un encadrant non inscrit n'est pas compté dans ses séances", () => {
  const state = {
    participants: [],
    realisations: [],
    sessions: [
      {
        id: "s1",
        date: "2026-10-03",
        slot: "soir",
        status: "encadree",
        encadrantId: "p-encadrant",
        participantIds: ["p-inscrit"],
      },
      {
        id: "s2",
        date: "2026-10-04",
        slot: "soir",
        status: "encadree",
        encadrantId: "autre-encadrant",
        participantIds: ["p-encadrant"],
      },
    ],
  };

  const management = useParticipantManagement({ state });

  assert.deepEqual(
    management.getParticipantSessions("p-encadrant").map(({ id }) => id),
    ["s2"],
  );
});
