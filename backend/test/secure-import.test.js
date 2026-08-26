import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [importSource, integrationSource, exportSource, legacyServerSource] = await Promise.all([
  readFile(new URL("../admin-users/secure-import-service.js", import.meta.url), "utf8"),
  readFile(new URL("../admin-users/express-integration.js", import.meta.url), "utf8"),
  readFile(new URL("../admin-users/export-service.js", import.meta.url), "utf8"),
  readFile(new URL("../server.js", import.meta.url), "utf8"),
]);

test("l'import administrateur utilise le contrôleur sécurisé", () => {
  assert.match(integrationSource, /path === "\/admin\/import-data"/);
  assert.match(integrationSource, /importBusinessDataSafely/);
});

test("le rapprochement après import repose uniquement sur l'e-mail", () => {
  assert.match(importSource, /climbcrew_normalize_email\(coalesce\(p\.login_email, p\.email, ''\)\) = climbcrew_normalize_email\(u\.email\)/);
  assert.doesNotMatch(importSource, /lower\(trim\(p\.nom\)\)/);
  assert.doesNotMatch(importSource, /lower\(trim\(p\.prenom\)\)/);
});

test("un droit administrateur présent dans le JSON n'est jamais importé", () => {
  assert.doesNotMatch(importSource, /Boolean\(participant\.canAdmin\)/);
  assert.match(importSource, /update participants set can_admin = false/);
  assert.match(importSource, /can_admin = \(u\.role = 'admin' or u\.is_admin = true\)/);
  assert.match(importSource, /adminRightsImported: 0/);
});

test("l'import refuse de perdre l'association d'un administrateur actif", () => {
  assert.match(importSource, /where status = 'active'[\s\S]*role = 'admin'[\s\S]*is_admin = true/);
  assert.match(importSource, /chaque administrateur actif doit correspondre à une fiche importée/);
  assert.match(importSource, /adresse\(s\) e-mail sont présentes sur plusieurs fiches/);
});

test("l'export complet est dans le format métier réimportable", () => {
  for (const field of [
    "numeroCorde", "cotationReference", "cotationAjustee", "nomOuvreur",
    "styleRealisation", "dateRealisation", "canEncadrer",
    "canReferer", "avatarId", "crestId", "customAvatarImage",
  ]) {
    assert.match(exportSource, new RegExp(`${field}:`));
  }
  assert.match(exportSource, /participantIds[, :]/);
  assert.match(exportSource, /climbcrew-complete-export-v3/);
  assert.match(exportSource, /accountMetadata/);
  assert.doesNotMatch(exportSource, /password_hash/);
  assert.doesNotMatch(exportSource, /token_hash/);
});

test("une réalisation historique sans note reste réimportable", () => {
  assert.match(
    exportSource,
    /rating: row\.rating === null \|\| row\.rating === undefined \? "" : Number\(row\.rating\)/,
  );
});

test("la route fichier legacy reste bloquée en production", () => {
  assert.match(integrationSource, /blockLegacyFileImportInProduction/);
  assert.match(legacyServerSource, /app\.post\("\/import-data"/);
});
