import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

test("l'habillage d'octobre reprend les vingt illustrations validées (5 × 4)", () => {
  const image = readFileSync(new URL("../public/media/avatars/seasonal/pumpkins-2026-approved.webp", import.meta.url));
  const css = readFileSync(new URL("../src/styles/seasonal-pumpkin.css", import.meta.url), "utf8");
  assert.equal(image.toString("ascii", 0, 4), "RIFF");
  assert.equal(image.toString("ascii", 8, 12), "WEBP");
  assert.equal((image[26] | (image[27] << 8)) & 0x3fff, 1000);
  assert.equal((image[28] | (image[29] << 8)) & 0x3fff, 800);
  // Le contrôle d'intégrité empêche une substitution silencieuse des dessins validés.
  assert.equal(createHash("sha256").update(image).digest("hex"), "c037b5a65cc6107a353af9633ffa6d5ec82525a6fb7d46a09dc0fefb1bd19ac9");
  assert.match(css, /pumpkins-2026-approved\.webp/);
  assert.match(css, /background-size: 500% 400%/);
});

test("le remplacement visuel conserve l'avatar personnel et la version normale en novembre", () => {
  const profile = readFileSync(new URL("../src/components/ProfileGecko.jsx", import.meta.url), "utf8");
  const chat = readFileSync(new URL("../src/pages/Chat.jsx", import.meta.url), "utf8");
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(profile, /pumpkinIndex === null/);
  assert.match(profile, /imageForLevel\(avatar, level, variant\)/);
  assert.match(profile, /customAvatarSource\(participant\)/);
  assert.match(chat, /octoberPumpkinSalt !== null/);
  assert.match(app, /useOctoberPumpkin\(authUser\?\.id\)/);
  const hook = readFileSync(new URL("../src/hooks/useOctoberPumpkin.js", import.meta.url), "utf8");
  assert.match(hook, /millisecondsUntilNextLocalDay\(now\)/);
  assert.match(hook, /isOctoberPumpkinDate\(date\)/);
});
