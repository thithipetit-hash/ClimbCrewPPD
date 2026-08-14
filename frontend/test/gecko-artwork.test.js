import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { GECKO_REAL_SPRITE } from "../src/assets/gecko-real/index.js";

const componentUrl = new URL("../src/components/ProfileGecko.jsx", import.meta.url);
const cssUrl = new URL("../src/styles/profile-gecko.css", import.meta.url);

test("Mon Profil utilise une vraie illustration Gecko raster WebP valide", () => {
  const component = readFileSync(componentUrl, "utf8");
  const css = readFileSync(cssUrl, "utf8");

  assert.match(component, /GECKO_REAL_SPRITE/);
  assert.match(component, /<img/);
  assert.doesNotMatch(component, /<GeckoArtwork/);
  assert.ok(GECKO_REAL_SPRITE.startsWith("data:image/webp;base64,UklGR"));

  const raster = Buffer.from(GECKO_REAL_SPRITE.split(",", 2)[1], "base64");
  assert.ok(raster.length > 50_000, "la planche raster doit contenir de vraies données image");
  assert.equal(raster.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(raster.subarray(8, 12).toString("ascii"), "WEBP");
  assert.equal(raster.readUInt32LE(4) + 8, raster.length, "le conteneur WebP ne doit pas être tronqué");

  assert.match(css, /width:\s*800%/);
  assert.match(css, /height:\s*200%/);
  assert.match(css, /--gecko-column/);
  assert.match(css, /--gecko-row/);
});
