import test from "node:test";
import assert from "node:assert/strict";

import { buddyPreferenceKeyForSession } from "./buddy-preferences.js";

test("une séance est associée au couple jour-créneau Buddy correspondant", () => {
  assert.equal(buddyPreferenceKeyForSession("2026-09-28", "midi"), "Lun:midi");
  assert.equal(buddyPreferenceKeyForSession("2026-10-01", "soir"), "Jeu:soir");
  assert.equal(buddyPreferenceKeyForSession("2026-10-02", "matin"), "Ven:matin");
});

test("les jours hors planning et les créneaux inconnus ne créent pas de préférence Buddy", () => {
  assert.equal(buddyPreferenceKeyForSession("2026-09-27", "midi"), "");
  assert.equal(buddyPreferenceKeyForSession("2026-09-28", "nuit"), "");
  assert.equal(buddyPreferenceKeyForSession("date-invalide", "soir"), "");
});
