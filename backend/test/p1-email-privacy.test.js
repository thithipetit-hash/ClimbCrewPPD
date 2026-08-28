import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  serializeParticipant,
  serializePublicParticipant,
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
  profile_public: true,
  custom_avatar_image: "data:image/webp;base64,SECRET",
};

test("la vue complète utilise login_email et remplace le Base64 par un marqueur", () => {
  const participant = serializeParticipant(participantRow);
  assert.equal(participant.email, "alice@example.test");
  assert.equal(participant.avatarId, "lynx");
  assert.equal(participant.hasCustomAvatar, true);
  assert.equal(participant.customAvatarImage, "remote");
  assert.equal(participant.customAvatarImage.includes("base64"), false);
  assert.equal(participant.cotisation, true);
  assert.equal(participant.ffme, true);
  assert.equal(participant.canAdmin, true);
});

test("la vue publique signale l avatar sans divulguer son Base64", () => {
  const participant = serializePublicParticipant(participantRow);
  assert.equal(participant.id, "42");
  assert.equal(participant.passport, "vert");
  assert.equal(participant.cotisation, true);
  assert.equal(participant.ffme, true);
  assert.equal(participant.avatarId, "lynx");
  assert.equal(participant.crestId, "flamme");
  assert.equal(participant.hasCustomAvatar, true);
  assert.equal(participant.customAvatarImage, "remote");
  assert.equal(participant.profilePublic, true);
  assert.equal(participant.email, "");
  assert.equal(participant.canAdmin, false);
});

test("la vue privée conserve les données club mais masque aussi l avatar personnalisé", () => {
  const participant = serializePrivateParticipant({ ...participantRow, profile_public: false });
  assert.equal(participant.id, "42");
  assert.equal(participant.nom, "Martin");
  assert.equal(participant.prenom, "Alice");
  assert.equal(participant.passport, "vert");
  assert.equal(participant.cotisation, true);
  assert.equal(participant.ffme, true);
  assert.equal(participant.canEncadrer, true);
  assert.equal(participant.canReferer, true);
  assert.equal(participant.email, "");
  assert.equal(participant.sexe, "");
  assert.equal(participant.canAdmin, false);
  assert.equal(participant.avatarId, "gecko");
  assert.equal(participant.crestId, "cristal");
  assert.equal(participant.hasCustomAvatar, false);
  assert.equal(participant.customAvatarImage, "");
  assert.equal(participant.profilePublic, false);
});

test("la migration reprend l'ancien email et synchronise les deux colonnes", async () => {
  const source = await readFile(new URL("../admin-users/database.js", import.meta.url), "utf8");
  assert.match(source, /drop index if exists uq_participants_login_email_normalized/);
  assert.match(source, /set login_email = nullif\(email, ''\)/);
  assert.match(source, /create or replace function climbcrew_sync_participant_email\(\)/);
  assert.match(source, /before insert or update of email, login_email on participants/);
  assert.match(source, /email = lower\(trim\(u\.email\)\)/);
  assert.match(source, /login_email = lower\(trim\(u\.email\)\)/);
});

test("les lectures participants et réalisations utilisent les contrôleurs de confidentialité", async () => {
  const routes = await readFile(new URL("../admin-users/explicit-routes.js", import.meta.url), "utf8");
  const privacy = await readFile(new URL("../admin-users/participant-privacy-service.js", import.meta.url), "utf8");
  assert.match(routes, /app\.get\("\/participants", requireAuth, listParticipantsWithPrivacy\)/);
  assert.match(routes, /app\.get\("\/participants\/:id\/avatar", requireAuthUser, getParticipantCustomAvatar\)/);
  assert.match(routes, /app\.get\("\/realisations", requireAuth, listRealisationsWithPrivacy\)/);
  assert.match(privacy, /serializePublicParticipant/);
  assert.match(privacy, /cotisation: Boolean\(row\.cotisation\)/);
  assert.match(privacy, /ffme: Boolean\(row\.ffme\)/);
  assert.match(privacy, /has_custom_avatar/);
  assert.doesNotMatch(privacy, /profile_public, custom_avatar_image\s+from participants/);
  assert.match(privacy, /r\.participant_id::text = \$2/);
  assert.match(privacy, /p\.id::text = r\.participant_id::text/);
  assert.match(privacy, /coalesce\(p\.profile_public, false\) = true/);
});
