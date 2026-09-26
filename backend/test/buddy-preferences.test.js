import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanBuddyPreferences,
  legacyBuddyLists,
  legacyBuddyPreferences,
} from "../buddy-routes.js";

test("les préférences buddy sont validées par couple jour-séance", () => {
  assert.deepEqual(
    cleanBuddyPreferences(["Lun:matin", "Lun:soir", "Lun:matin", "Lun:nuit"]),
    ["Lun:matin", "Lun:soir"],
  );
});

test("la compatibilité jours/créneaux conserve le produit cartésien historique", () => {
  const preferences = legacyBuddyPreferences(["Lun", "Mar"], ["midi", "soir"]);
  assert.deepEqual(preferences, ["Lun:midi", "Lun:soir", "Mar:midi", "Mar:soir"]);
  assert.deepEqual(legacyBuddyLists(preferences), {
    days: ["Lun", "Mar"],
    slots: ["midi", "soir"],
  });
});
