import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAccountRequestConfirmation,
  buildAdminAccountRequestReadyEmail,
} from "../admin-users/email-templates.js";

test("les mails de confirmation décrivent l’approbation manuelle du compte", () => {
  const applicant = buildAccountRequestConfirmation({
    prenom: "Alex",
    nom: "Test",
    publicUrl: "https://pre.example.test",
    verificationUrl: "https://pre.example.test/confirm?token=test",
  });

  assert.match(applicant.text, /compte restera en attente/);
  assert.match(applicant.text, /associer à une fiche grimpeur puis l’approuver/);
  assert.match(applicant.html, /compte restera en attente/);
  assert.doesNotMatch(applicant.text, /activé automatiquement/);
  assert.doesNotMatch(applicant.html, /activé automatiquement/);

  const admin = buildAdminAccountRequestReadyEmail({
    prenom: "Alex",
    nom: "Test",
    email: "alex@example.test",
    publicUrl: "https://pre.example.test",
  });

  assert.match(admin.text, /compte reste en attente/);
  assert.match(admin.text, /fiche grimpeur puis approuvez-le/);
  assert.match(admin.html, /compte reste en attente/);
  assert.doesNotMatch(admin.text, /activé automatiquement/);
  assert.doesNotMatch(admin.html, /activé automatiquement/);
});
