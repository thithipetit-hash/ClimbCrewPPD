import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("le backend cible les comptes actifs et conserve un accusé de lecture individuel", async () => {
  const [serverSource, broadcastSource] = await Promise.all([
    readFile(new URL("../../backend/server.js", import.meta.url), "utf8"),
    readFile(new URL("../../backend/broadcast-message-routes.js", import.meta.url), "utf8"),
  ]);
  assert.match(serverSource, /create table if not exists broadcast_messages/);
  assert.match(serverSource, /create table if not exists broadcast_message_recipients/);
  assert.match(serverSource, /installBroadcastMessageRoutes\(app, \{ requireAuth, requireAdmin, pool \}\)/);
  assert.match(broadcastSource, /select \$1, id from users where status = 'active'/);
  assert.match(broadcastSource, /\/auth\/broadcast-messages\/pending/);
  assert.match(broadcastSource, /\/auth\/broadcast-messages\/\:id\/read/);
  assert.match(broadcastSource, /where message_id = \$1 and user_id = \$2/);
});

test("Administration Serveur diffuse et l'application affiche le prochain message", async () => {
  const [appSource, modalSource, serverAdministrationSource] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/BroadcastMessageModal.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/Logs.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(serverAdministrationSource, /Diffuser un message/);
  assert.match(serverAdministrationSource, /\/admin\/broadcast-messages/);
  assert.match(appSource, /pendingBroadcastMessages/);
  assert.match(appSource, /BroadcastMessageModal/);
  assert.match(modalSource, /Message du club/);
  assert.match(modalSource, /J’ai lu/);
});
