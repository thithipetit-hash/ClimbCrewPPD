import test from "node:test";
import assert from "node:assert/strict";
import { isChristmasAvatarDate, millisecondsUntilNextLocalDay, isOctoberPumpkinDate, pumpkinIndexForParticipant, pumpkinSpriteStyle } from "../src/lib/seasonal-avatar.js";

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

test("citrouilles visibles uniquement en octobre 2026 ; retour le 1er novembre", () => {
  assert.equal(isOctoberPumpkinDate(new Date(2026, 8, 30, 23, 59)), false);
  assert.equal(isOctoberPumpkinDate(new Date(2026, 9, 1, 0, 0)), true);
  assert.equal(isOctoberPumpkinDate(new Date(2026, 9, 31, 23, 59, 59)), true);
  assert.equal(isOctoberPumpkinDate(new Date(2026, 10, 1, 0, 0)), false);
  assert.equal(isOctoberPumpkinDate(new Date(2027, 9, 25)), false);
});

test("20 variantes de citrouilles disponibles, stables pendant la connexion", () => {
  const indexes = Array.from({ length: 20 }, (_, n) => pumpkinIndexForParticipant(String(n), 17));
  indexes.forEach((index, n) => {
    assert.ok(index >= 0 && index < 20);
    assert.equal(index, pumpkinIndexForParticipant(String(n), 17));
  });
  assert.notEqual(pumpkinIndexForParticipant("42", 17), pumpkinIndexForParticipant("42", 18));
  assert.deepEqual(pumpkinSpriteStyle(0), { backgroundPosition: "0% 0%" });
  assert.deepEqual(pumpkinSpriteStyle(19), { backgroundPosition: "100% 100%" });
});
