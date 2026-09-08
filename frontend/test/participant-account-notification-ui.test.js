import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const administration = await readFile(new URL("../src/pages/Administration.jsx", import.meta.url), "utf8");
const profile = await readFile(new URL("../src/pages/Profil.jsx", import.meta.url), "utf8");

test("les qualifications et le réglage e-mail vivent dans Administration React", async () => {
  await assert.rejects(access(new URL("../src/participant-account-notification-ui.js", import.meta.url)));
  await assert.rejects(access(new URL("../src/participant-qualification-ui.js", import.meta.url)));
  assert.match(administration, /Initiateur SAE/);
  assert.match(administration, /Initiateur SNE/);
  assert.match(administration, /E-mail demandes/);
  assert.match(administration, /account-notifications/);
});

test("la case e-mail reste inactive sans administrateur et compte actif associés", () => {
  assert.match(administration, /participant\.canAdmin/);
  assert.match(administration, /preference\.status === "active"/);
  assert.match(administration, /preference\.isAdmin/);
  assert.match(administration, /disabled=\{!notificationEligible \|\| notificationSaving\}/);
});

test("le réglage n'est plus affiché dans Mon profil", () => {
  assert.doesNotMatch(profile, /Notifications administrateur/);
  assert.doesNotMatch(profile, /notification-preference/);
});
