import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const componentUrl = new URL("../src/components/ProfileGecko.jsx", import.meta.url);
const artworkUrl = new URL("../src/components/GeckoArtwork.jsx", import.meta.url);
const cssUrl = new URL("../src/styles/profile-gecko.css", import.meta.url);

test("Mon Profil affiche une illustration Gecko premium sans asset externe", () => {
  const component = readFileSync(componentUrl, "utf8");
  const artwork = readFileSync(artworkUrl, "utf8");
  const css = readFileSync(cssUrl, "utf8");

  assert.match(component, /<GeckoArtwork/);
  assert.doesNotMatch(component, /gecko-evolution\.webp/);
  assert.doesNotMatch(css, /background-image\s*:/);

  assert.match(artwork, /<svg/);
  assert.match(artwork, /linearGradient/);
  assert.match(artwork, /feDropShadow/);
  assert.match(artwork, /hasShoes/);
  assert.match(artwork, /hasHarness/);
  assert.match(artwork, /hasQuickdraws/);
  assert.match(artwork, /hasPremiumGear/);
  assert.match(artwork, /isExpert/);
  assert.match(artwork, /isMaster/);
  assert.match(artwork, /isCrystal/);
  assert.match(artwork, /variant === "feminine"/);
});
