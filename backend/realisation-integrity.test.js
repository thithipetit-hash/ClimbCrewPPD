import assert from "node:assert/strict";
import test from "node:test";
import { assertRealisationIntegrity, RealisationIntegrityError } from "./realisation-integrity.js";

function makePool({ enrolled = true, date = "2026-11-19", belayerEnrolled = true } = {}) {
  return {
    async query(sql) {
      if (sql.includes("from routes")) return { rowCount: 1, rows: [{ id: "route-1" }] };
      if (sql.includes("from sessions")) {
        if (!enrolled) return { rowCount: 0, rows: [] };
        return { rowCount: 1, rows: [{ date }] };
      }
      if (sql.includes("join participants")) {
        return { rowCount: belayerEnrolled ? 1 : 0, rows: belayerEnrolled ? [{}] : [] };
      }
      throw Error("Unexpected SQL");
    },
  };
}
const realisation = {
  voieId: "route-1",
  sessionId: "session-1",
  dateRealisation: "2026-11-19T12:00:00",
  chute: false,
  assureurId: "",
};
test("an enrolled member may record without a paid contribution", async () => {
  await assert.doesNotReject(assertRealisationIntegrity({
    pool: makePool(), realisation, participantId: "123",
  }));
});
test("a member without session attendance remains blocked", async () => {
  await assert.rejects(assertRealisationIntegrity({
    pool: makePool({ enrolled: false }), realisation, participantId: "123",
  }), RealisationIntegrityError);
});
test("the date must match the session", async () => {
  await assert.rejects(assertRealisationIntegrity({
    pool: makePool({ date: "2026-11-18" }), realisation, participantId: "123",
  }), /La date de réalisation/);
});
test("a belayer is required when a fall is recorded", async () => {
  await assert.rejects(assertRealisationIntegrity({
    pool: makePool(), realisation: { ...realisation, chute: true }, participantId: "123",
  }), /binôme assureur/);
});
