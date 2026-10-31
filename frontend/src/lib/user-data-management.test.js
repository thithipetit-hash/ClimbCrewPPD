import assert from "node:assert/strict";
import test from "node:test";
import {
  USER_DATA_FILTER_CHOICES,
  USER_DATA_PASSPORT_OPTIONS,
  buildParticipantQualificationsPayload,
  buildParticipantUpdatePayload,
  displayUserDataValue,
  participantQualificationsChanged,
} from "./user-data-management.js";

test("les passeports utilisent les libellés métier partagés", () => {
  assert.deepEqual(USER_DATA_PASSPORT_OPTIONS[0], { value: "sans", label: "Gris clair" });
  assert.deepEqual(USER_DATA_FILTER_CHOICES.passport[0], ["sans", "Gris clair"]);
  assert.equal(displayUserDataValue({ passport: "sans" }, "passport"), "Gris clair");
});

test("le payload utilisateur normalise les champs persistés", () => {
  const participant = { id: "p1", initiateurSae: false };
  const draft = {
    nom: "  Dupont ",
    prenom: " Alice  ",
    email: " alice@example.test ",
    sexe: "f",
    passport: "orange",
    passportDecouverte: 1,
    passeportFfme: 0,
    cotisation: 1,
    ffme: true,
    canEncadrer: false,
    canReferer: true,
    canAdmin: false,
  };

  const payload = buildParticipantUpdatePayload(participant, draft);

  assert.equal(payload.nom, "Dupont");
  assert.equal(payload.prenom, "Alice");
  assert.equal(payload.email, "alice@example.test");
  assert.equal(payload.passport, "orange");
  assert.equal(payload.passportDecouverte, true);
  assert.equal(payload.cotisation, true);
  assert.equal(payload.passeportFfme, false);
});

test("les changements de qualification sont détectés séparément", () => {
  const participant = { initiateurSae: false, initiateurSne: false };
  const draft = { initiateurSae: true, initiateurSne: false };

  assert.equal(participantQualificationsChanged(participant, draft), true);
  assert.deepEqual(buildParticipantQualificationsPayload(draft), {
    initiateurSae: true,
    initiateurSne: false,
  });
});
