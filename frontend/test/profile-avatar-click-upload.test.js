import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Mon profil conserve ses choix d'avatar image et sexe via un bouton distinct", async () => {
  const source = await readFile(new URL("../src/components/ProfileGecko.jsx", import.meta.url), "utf8");

  assert.match(source, /function handleAvatarImageClick\(\)/);
  assert.match(source, /function handleAvatarEditorClick\(\)/);
  assert.match(source, /setShowAvatarEditor\(\(visible\) => !visible\)/);
  assert.match(source, /onClick=\{handleAvatarImageClick\}/);
  assert.match(source, /onClick=\{handleAvatarEditorClick\}/);
  assert.match(source, /Personnaliser mon avatar/);
  assert.match(source, /Personnaliser mon profil/);
  assert.match(source, /<span>Avatar<\/span>/);
  assert.match(source, /<span>Sexe<\/span>/);
  assert.match(source, /<option value="">Non précisé<\/option>/);
  assert.match(source, /<option value="H">Homme<\/option>/);
  assert.match(source, /<option value="F">Femme<\/option>/);
  assert.match(source, /Charger une image personnelle/);
  assert.match(source, /PNG, JPEG ou WebP · 5 Mo maximum/);
  assert.match(source, /style=\{\{ display: "none" \}\}/);
});


test("le changement d'avatar force le rechargement de l'image affichée", async () => {
  const source = await readFile(new URL("../src/components/ProfileGecko.jsx", import.meta.url), "utf8");
  assert.match(source, /avatarImageRevision/);
  assert.match(source, /setAvatarImageRevision\(\(revision\) => revision \+ 1\)/);
  assert.match(source, /refreshableImageSource/);
  assert.match(source, /reload=/);
});


test("le profil local se resynchronise avec l'avatar sauvegardé", async () => {
  const source = await readFile(new URL("../src/pages/Profil.jsx", import.meta.url), "utf8");
  assert.match(source, /setParticipants\(\(current\) =>/);
  assert.match(source, /participant\.id\) === participantId \? myParticipant : participant/);
  assert.match(source, /\[myParticipant, \.\.\.current\]/);
});

test("le clic sur l'avatar ouvre les huit évolutions pour tous les profils", async () => {
  const source = await readFile(new URL("../src/components/ProfileGecko.jsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/styles/profile-gecko.css", import.meta.url), "utf8");

  assert.match(source, /setShowEvolutionHistory\(\(visible\) => !visible\)/);
  assert.match(source, /aria-expanded=\{showEvolutionHistory\}/);
  assert.match(source, /\{showEvolutionHistory && \(/);
  assert.match(source, /GECKO_LEVEL_LABELS\.map\(\(evolutionLabel, index\)/);
  assert.doesNotMatch(source, /GECKO_LEVEL_LABELS\.slice\(0, level - 1\)/);
  assert.match(source, /const isCurrent = displayedLevel === level/);
  assert.match(source, /const isFuture = displayedLevel > level/);
  assert.match(source, /aria-current=\{isCurrent \? "step" : undefined\}/);
  assert.match(source, /Niveau actuel/);
  assert.match(source, /À débloquer/);
  assert.match(css, /\.profile-avatar-history-item--current/);
  assert.match(css, /\.profile-avatar-history-item--locked \{ filter: grayscale\(1\); opacity: \.48; \}/);
});

test("une photo personnelle ne bloque pas la galerie des évolutions", async () => {
  const source = await readFile(new URL("../src/components/ProfileGecko.jsx", import.meta.url), "utf8");

  assert.doesNotMatch(source, /if \(!customImage\) setShowEvolutionHistory/);
  assert.match(source, /La photo personnelle reste inchangée/);
});
