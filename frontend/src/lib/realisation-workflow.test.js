import assert from "node:assert/strict";
import test from "node:test";
import { getParticipantSessionDays, resolveSessionIdForRealisation } from "./realisation-workflow.js";

const sessions = [{
  id: "session-1",
  date: "2026-11-19",
  slot: "midi",
  status: "encadree",
  encadrantId: "supervisor",
  participantIds: ["climber"],
}];
test("members and supervisors can select the session for a realisation", () => {
  for (const id of ["climber", "supervisor"]) {
    assert.deepEqual(getParticipantSessionDays(sessions, id), ["2026-11-19"]);
    assert.equal(resolveSessionIdForRealisation(sessions, id, "2026-11-19"), "session-1");
  }
});
test("non participants cannot select a session", () => {
  assert.deepEqual(getParticipantSessionDays(sessions, "outsider"), []);
  assert.equal(resolveSessionIdForRealisation(sessions, "outsider", "2026-11-19"), "");
});
