import test from "node:test";
import assert from "node:assert/strict";
import {
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
