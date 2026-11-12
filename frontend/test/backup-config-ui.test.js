import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const serverAdministrationSource = await readFile(
  new URL("../src/pages/Logs.jsx", import.meta.url),
  "utf8",
);
const administrationSource = await readFile(
  new URL("../src/pages/Administration.jsx", import.meta.url),
  "utf8",
);
const uiConfigSource = await readFile(
  new URL("../src/lib/ui-config.js", import.meta.url),
  "utf8",
);

test("l'onglet Log devient Administration", () => {
  assert.match(uiConfigSource, /key: "logs", label: "Administration"/);
  assert.doesNotMatch(uiConfigSource, /label: "Log"/);
});

test("sauvegardes et restauration sont regroupées dans Administration", () => {
  assert.match(serverAdministrationSource, /Sauvegardes et restauration/);
  assert.match(serverAdministrationSource, /Restaurer/);
  assert.match(serverAdministrationSource, /Importer une sauvegarde \.dump/);
  assert.match(serverAdministrationSource, /backupConfig\?\.emailConfigured/);
  assert.match(serverAdministrationSource, /BACKUP_RECIPIENT n’est pas configuré/);
  assert.doesNotMatch(administrationSource, /Sauvegardes serveur/);
  assert.doesNotMatch(administrationSource, /Restaurer/);
});

test("messagerie, diffusion et logs sont regroupés dans Administration", () => {
  assert.match(serverAdministrationSource, /title="Logs"/);
  assert.match(serverAdministrationSource, /title="Messagerie"/);
  assert.match(serverAdministrationSource, /Adresse d’expédition/);
  assert.match(serverAdministrationSource, /emailFromAddress/);
  assert.match(serverAdministrationSource, /title="Diffuser un message"/);
  assert.match(serverAdministrationSource, /\/admin\/broadcast-messages/);
  assert.doesNotMatch(administrationSource, /Diffuser un message/);
});

test("aucune adresse de sauvegarde n'est codée en dur dans l'administration", () => {
  assert.doesNotMatch(serverAdministrationSource, /cristal\.climbcrew@gmail\.com/);
});

test("le bouton d'envoi est désactivé sans destinataire configuré", () => {
  assert.match(
    serverAdministrationSource,
    /disabled=\{backupBusy \|\| !backupConfig\?\.emailConfigured\}/,
  );
});
