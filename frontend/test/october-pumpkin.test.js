import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("l'habillage d'octobre comprend vingt illustrations distinctes", () => {
  const svg = readFileSync(new URL("../public/media/avatars/seasonal/pumpkins-2026.svg", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/styles/seasonal-pumpkin.css", import.meta.url), "utf8");
  assert.equal((svg.match(/<g transform="translate\(/g) || []).length, 20);
  assert.match(css, /pumpkins-2026\.svg/);
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
  assert.match(app, /isOctoberPumpkinDate\(seasonalDate\)/);
  assert.match(app, /millisecondsUntilNextLocalDay\(now\)/);
});
