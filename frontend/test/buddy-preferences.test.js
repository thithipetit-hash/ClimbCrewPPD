import test from "node:test";
import assert from "node:assert/strict";
import {
  buddyPreferenceKeyForSession,
  buddyPreferencesFromAvailability,
  formatBuddyPreferences,
  normalizeBuddyPreferences,
} from "../src/lib/buddy-preferences.js";

test("les préférences distinguent chaque couple jour et séance", () => {
  assert.deepEqual(
    normalizeBuddyPreferences(["Lun:matin", "Lun:soir", "Lun:matin", "Sam:midi", "Dim:soir", "invalide"]),
    ["Lun:matin", "Lun:soir"],
  );
});

test("les anciennes disponibilités jours/créneaux restent compatibles", () => {
  assert.deepEqual(
    buddyPreferencesFromAvailability({ days: ["Lun", "Mer", "Sam", "Dim"], slots: ["midi", "soir"] }),
    ["Lun:midi", "Lun:soir", "Mer:midi", "Mer:soir"],
  );
});

test("le résumé conserve l'association exacte jour-séance", () => {
  assert.equal(
    formatBuddyPreferences({ preferences: ["Lun:matin", "Mar:soir"] }),
    "Lundi : Matin · Mardi : Soir",
  );
});

test("une date de séance produit la préférence Buddy jour-créneau correspondante", () => {
  assert.equal(buddyPreferenceKeyForSession("2026-09-28", "midi"), "Lun:midi");
  assert.equal(buddyPreferenceKeyForSession("2026-10-01", "soir"), "Jeu:soir");
  assert.equal(buddyPreferenceKeyForSession("2026-10-02", "matin"), "Ven:matin");
  assert.equal(buddyPreferenceKeyForSession("2026-09-27", "midi"), "");
  assert.equal(buddyPreferenceKeyForSession("2026-09-28", "nuit"), "");
});
