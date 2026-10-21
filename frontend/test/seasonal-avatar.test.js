import test from "node:test";
import assert from "node:assert/strict";
import { isChristmasAvatarDate, millisecondsUntilNextLocalDay } from "../src/lib/seasonal-avatar.js";

test("les avatars de Noël sont inactifs avant le 1er décembre", () => {
  assert.equal(isChristmasAvatarDate(new Date(2026, 10, 30, 23, 59, 59)), false);
});

test("tous les jours de décembre activent le chapeau de Noël, chaque année", () => {
  assert.equal(isChristmasAvatarDate(new Date(2026, 11, 1, 0, 0)), true);
  assert.equal(isChristmasAvatarDate(new Date(2026, 11, 24, 12, 0)), true);
  assert.equal(isChristmasAvatarDate(new Date(2026, 11, 31, 23, 59, 59)), true);
  assert.equal(isChristmasAvatarDate(new Date(2027, 11, 1, 0, 0)), true);
});

test("l'avatar normal revient automatiquement le 1er janvier", () => {
  assert.equal(isChristmasAvatarDate(new Date(2027, 0, 1, 0, 0)), false);
});

test("le rafraîchissement est programmé à minuit local", () => {
  assert.equal(millisecondsUntilNextLocalDay(new Date(2026, 11, 31, 23, 59, 59, 900)), 100);
  assert.equal(millisecondsUntilNextLocalDay(new Date(2026, 11, 1, 0, 0)), 24 * 60 * 60 * 1000);
});
