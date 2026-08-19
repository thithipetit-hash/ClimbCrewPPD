import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  serializeParticipant,
  serializePrivateParticipant,
} from "../admin-users/participant-privacy-service.js";

const participantRow = {
  id: 42,
  nom: "Martin",
  prenom: "Alice",
  email: "ancienne@example.test",
  login_email: "alice@example.test",
  passport: "vert",
  sexe: "f",
  cotisation: true,
  ffme: true,
  can_encadrer: true,
  can_referer: true,
  can_admin: true,
  avatar_id: "lynx",
  crest_id: "flamme",
  profile_public: false,
  custom_avatar_image: "data:image/webp;base64,SECRET",
};

test("la vue complète utilise login_email comme adresse canonique", () => {
  const participant = serializeParticipant(participantRow);
  assert.equal(participant.email, "alice@example.test");
  assert.equal(participant.avatarId, "lynx");
  assert.equal(participant.customAvatarImage, "data:image/webp;base64,SECRET");
});

test("la vue privée ne divulgue pas les données personnelles ou administratives", () => {
  const participant = serializePrivateParticipant(participantRow);

  assert.equal(participant.id, "42");
  assert.equal(participant.nom, "Martin");
  assert.equal(participant.prenom, "Alice");
  assert.equal(participant.passport, "vert");
  assert.equal(participant.canEncadrer, true);
  assert.equal(participant.canReferer, true);

  assert.equal(participant.email, "");
  assert.equal(participant.sexe, "");
  assert.equal(participant.cotisation, false);
  assert.equal(participant.ffme, false);
  assert.equal(participant.canAdmin, false);
  assert.equal(participant.avatarId, "gecko");
  assert.equal(participant.crestId, "cristal");
  assert.equal(participant.customAvatarImage, "");
  assert.equal(participant.profilePublic, false);
});

test("la migration reprend l'ancien email et synchronise les deux colonnes", async () => {
  const source = await readFile(
    new URL("../admin-users/database.js", import.meta.url),
    "utf8",
  );

  assert.match(source, /drop index if exists uq_participants_login_email_normalized/);
  assert.match(source, /set login_email = nullif\(email, ''\)/);
  assert.match(source, /create or replace function climbcrew_sync_participant_email\(\)/);
  assert.match(source, /before insert or update of email, login_email on participants/);
  assert.match(source, /email = lower\(trim\(u\.email\)\)/);
  assert.match(source, /login_email = lower\(trim\(u\.email\)\)/);
});

test("les lectures participants et réalisations utilisent les contrôleurs de confidentialité", async () => {
  const integration = await readFile(
    new URL("../admin-users/express-integration.js", import.meta.url),
    "utf8",
  );
  const privacy = await readFile(
    new URL("../admin-users/participant-privacy-service.js", import.meta.url),
    "utf8",
  );

  assert.match(integration, /path === "\/participants"[\s\S]*listParticipantsWithPrivacy/);
  assert.match(integration, /path === "\/realisations"[\s\S]*listRealisationsWithPrivacy/);
  assert.match(privacy, /r\.participant_id = \$2/);
  assert.match(privacy, /coalesce\(p\.profile_public, false\) = true/);
});
