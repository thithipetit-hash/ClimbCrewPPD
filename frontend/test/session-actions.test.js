import test from "node:test";
import assert from "node:assert/strict";

import {
  addParticipantToSessionValue,
  buildDefaultSession,
  removeParticipantFromSessionValue,
  upsertSession,
} from "../src/hooks/useSessionActions.js";

test("buildDefaultSession déduit date et créneau", () => {
  const session = buildDefaultSession("2026-09-08-soir");
  assert.equal(session.id, "2026-09-08-soir");
  assert.equal(session.date, "2026-09-08");
  assert.equal(session.slot, "soir");
  assert.deepEqual(session.participantIds, []);
});

test("upsertSession remplace ou ajoute sans muter la collection", () => {
  const source = [{ id: "s1", participantIds: [] }];
  const updated = { id: "s1", participantIds: ["p1"] };
  const replaced = upsertSession(source, updated);
  const added = upsertSession(source, { id: "s2", participantIds: [] });

  assert.notEqual(replaced, source);
  assert.deepEqual(source, [{ id: "s1", participantIds: [] }]);
  assert.deepEqual(replaced, [updated]);
  assert.equal(added.length, 2);
});

test("ajout et retrait participant respectent unicité et capacité", () => {
  const session = { id: "s1", participantIds: ["p1"], encadrantId: null, referentId: null };
  const withP2 = addParticipantToSessionValue(session, "p2");
  assert.deepEqual(withP2.participantIds, ["p1", "p2"]);
  assert.equal(addParticipantToSessionValue(withP2, "p2"), withP2);
  assert.deepEqual(removeParticipantFromSessionValue(withP2, "p1").participantIds, ["p2"]);
});
