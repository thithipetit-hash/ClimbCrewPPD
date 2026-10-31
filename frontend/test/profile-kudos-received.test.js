import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Profil affiche les Kudos reçus dans une section compacte par défaut", async () => {
  const profile = await readFile(new URL("../src/pages/Profil.jsx", import.meta.url), "utf8");
  const component = await readFile(new URL("../src/components/ProfileReceivedKudos.jsx", import.meta.url), "utf8");

  assert.match(profile, /<ProfileReceivedKudos/);
  assert.match(profile, /realisations=\{selectedRealisations\}/);
  assert.match(component, /<details className="card profile-kudos-received-card">/);
  assert.doesNotMatch(component, /<details[^>]*\sopen(?:=|\s|>)/);
  assert.match(component, /Kudos reçus/);
  assert.match(component, /kudosParticipantIds/);
  assert.match(component, /formatRouteForRealisation/);
  assert.match(component, /formatDateShortFr/);
});
