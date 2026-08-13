import test from "node:test";
import assert from "node:assert/strict";
import { calculateParticipantBadges } from "../src/lib/badges.js";

function earned(input, id) {
  return calculateParticipantBadges(input).find((badge) => badge.id === id)?.earned;
}

test("badges de première réussite", () => {
  const routesById = { r1: { id: "r1", numeroCorde: 1, cotationReference: "6a", tags: ["dalle"] } };
  const realisations = [{ id: "x1", voieId: "r1", modeRealisation: "en_tete", styleRealisation: "a_vue" }];
  const input = { realisations, routesById, sessions: [] };
  assert.equal(earned(input, "premiere_croix"), true);
  assert.equal(earned(input, "premiere_tete"), true);
  assert.equal(earned(input, "premier_a_vue"), true);
  assert.equal(earned(input, "club_6a"), true);
  assert.equal(earned(input, "premiere_moulinette"), false);
});

test("moulinette et critère flash sont indépendants", () => {
  const routesById = { r1: { id: "r1", numeroCorde: 1, cotationReference: "5c", tags: [] } };
  const realisations = [{ id: "x1", voieId: "r1", modeRealisation: "moulinette", styleRealisation: "flash" }];
  const input = { realisations, routesById, sessions: [] };
  assert.equal(earned(input, "premiere_moulinette"), true);
  assert.equal(earned(input, "premier_flash"), true);
  assert.equal(earned(input, "premiere_tete"), false);
});
