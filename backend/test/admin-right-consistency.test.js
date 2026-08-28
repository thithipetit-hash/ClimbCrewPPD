import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const participantRights = await readFile(
  new URL("../admin-users/participant-admin-right-service.js", import.meta.url),
  "utf8",
);
const association = await readFile(
  new URL("../admin-users/account-participant-association-service.js", import.meta.url),
  "utf8",
);
const routesSource = await readFile(
  new URL("../admin-users/explicit-routes.js", import.meta.url),
  "utf8",
);

test("la mise à jour d'un participant pilote aussi le rôle réel du compte", () => {
  assert.match(routesSource, /app\.put\("\/participants\/:id", requireAuth, requireAdmin, updateParticipantWithAdminRight\)/);
  assert.match(participantRights, /update participants[\s\S]*can_admin = \$11/);
  assert.match(participantRights, /update users[\s\S]*role = case when \$2 then 'admin' else 'user' end/);
  assert.match(participantRights, /is_admin = \$2/);
});

test("retirer Administrateur ne peut pas supprimer le dernier admin actif", () => {
  assert.match(participantRights, /ensureAnotherActiveAdmin/);
  assert.match(participantRights, /Le dernier compte administrateur actif ne peut pas perdre ce droit/);
});

test("retirer Administrateur coupe aussi les notifications de demandes", () => {
  assert.match(participantRights, /receive_account_notifications = case[\s\S]*when \$2 then receive_account_notifications[\s\S]*else false/);
});

test("une association manuelle applique le droit de la fiche cible", () => {
  assert.match(participantRights, /select id, can_admin from participants/);
  assert.match(participantRights, /const desiredAdmin = Boolean\(targetParticipant\?\.can_admin\)/);
  assert.match(routesSource, /setAccountParticipantAssociation/);
});

test("une dissociation supprime tout rôle administrateur orphelin", () => {
  assert.match(association, /set participant_id = null/);
  assert.match(association, /role = 'user'/);
  assert.match(association, /is_admin = false/);
  assert.match(association, /receive_account_notifications = false/);
});

test("l'approbation reprend le droit Administrateur de la fiche", () => {
  assert.match(routesSource, /approveVerifiedAccountWithParticipantRole/);
  assert.match(participantRights, /select id, can_admin from participants/);
  assert.match(participantRights, /const isAdmin = Boolean\(participant\.can_admin\)/);
  assert.match(participantRights, /role = case when \$2 then 'admin' else 'user' end/);
});
