import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("la surcouche de création de compte affiche bien la règle à 8 caractères", async () => {
  const source = await readFile(new URL("../src/issue-13-access-page.js", import.meta.url), "utf8");
  assert.match(source, /8 caractères minimum/);
  assert.doesNotMatch(source, /12 caractères/);
});

test("le formulaire de réinitialisation n'est jamais confondu avec la création de compte", async () => {
  // Les deux formulaires affichent les règles du mot de passe : seule la
  // présence du champ Prénom distingue la création de compte. Sans ça, le
  // bouton « Mettre à jour le mot de passe » se faisait renommer en
  // « Création d'un compte » sur l'écran de réinitialisation.
  const source = await readFile(new URL("../src/issue-13-access-page.js", import.meta.url), "utf8");
  assert.match(source, /function isRequestFormVisible\(card\)/);
  assert.match(source, /text === "prénom"/);
  assert.match(source, /const requestFormVisible = isRequestFormVisible\(card\)/);
  assert.doesNotMatch(source, /const requestFormVisible = enhancePasswordPolicy\(card\)/);
});
