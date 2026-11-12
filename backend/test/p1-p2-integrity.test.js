import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { GRADES as SHARED_GRADES } from "../../shared/climbing-grades.js";
import { MAX_SESSION_PARTICIPANTS } from "../../shared/session-rules.js";
import {
  GRADES,
  ValidationError,
  validateChatPinned,
  validateChatPoll,
  validateChatPollOption,
  validateChatReaction,
  validateRoutePayload,
  validateSessionPayload,
} from "../validation.js";
import { assertSessionCapacity } from "../admin-users/session-authorization-service.js";

test("frontend, backend et migration partagent l'échelle complète des cotations", async () => {
  assert.deepEqual(GRADES, SHARED_GRADES);
  for (const grade of ["4a+", "4b+", "4c+", "7b+", "7c+"]) {
    assert.ok(GRADES.includes(grade), grade);
    const route = validateRoutePayload({
      numeroVoieUnique: `route-${grade}`,
      numeroCorde: 1,
      couleurPrises: "Bleu",
      cotationReference: grade,
      cotationAjustee: grade,
      nomOuvreur: "Test",
      dateCreation: "2026-09-27",
    });
    assert.equal(route.cotationReference, grade);
  }

  const migration = await readFile(
    new URL("../database/migrations/023_grade_scale_alignment.sql", import.meta.url),
    "utf8",
  );
  for (const grade of SHARED_GRADES) {
    assert.match(migration, new RegExp(`'${grade.replace("+", "\\+")}'`));
  }
});

test("la capacité de 18 personnes est imposée par la validation et la règle transactionnelle", () => {
  const participantIds = Array.from({ length: MAX_SESSION_PARTICIPANTS }, (_, index) => String(index + 1));
  const session = validateSessionPayload({
    date: "2026-09-28",
    slot: "midi",
    status: "encadree",
    participantIds,
  }, "2026-09-28-midi");
  assert.equal(session.participantIds.length, MAX_SESSION_PARTICIPANTS);
  assert.deepEqual(assertSessionCapacity(participantIds), participantIds);
  assert.deepEqual(assertSessionCapacity([null, undefined, "", ...participantIds]), participantIds);

  const overflow = [...participantIds, "19"];
  assert.throws(
    () => validateSessionPayload({
      date: "2026-09-28",
      slot: "midi",
      status: "encadree",
      participantIds: overflow,
    }, "2026-09-28-midi"),
    ValidationError,
  );
  assert.throws(() => assertSessionCapacity(overflow), /18 participants/i);
});

test("les entrées Chat sont strictement validées", () => {
  assert.equal(validateChatPinned(false), false);
  assert.equal(validateChatPinned("false"), false);
  assert.equal(validateChatPinned(true), true);
  assert.throws(() => validateChatPinned("non"), ValidationError);

  const poll = validateChatPoll({ question: "On grimpe ?", options: ["Oui", "Non", "Oui"] });
  assert.deepEqual(poll.options, ["Oui", "Non"]);
  assert.equal(validateChatPollOption(2, { options: [{ id: 1 }, { id: 2 }] }), 2);
  assert.throws(() => validateChatPollOption(9, { options: [{ id: 1 }] }), ValidationError);

  assert.equal(validateChatReaction("👍"), "👍");
  assert.throws(() => validateChatReaction("x".repeat(25)), ValidationError);
});
