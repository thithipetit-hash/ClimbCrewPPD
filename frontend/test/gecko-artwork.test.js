import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { GECKO_REAL_SPRITE } from "../src/assets/gecko-real/index.js";

const componentUrl = new URL("../src/components/ProfileGecko.jsx", import.meta.url);
const cssUrl = new URL("../src/styles/profile-gecko.css", import.meta.url);

const EXPECTED_WEBP_SHA256 = "a351c9dab025efc421137076be7a358ec241c8bd6cd6d8860dd0823b0ddab664";

test("Mon Profil utilise les vraies illustrations Gecko raster", () => {
  const component = readFileSync(componentUrl, "utf8");
  const css = readFileSync(cssUrl, "utf8");

  assert.match(component, /GECKO_REAL_SPRITE/);
  assert.match(component, /<img/);
  assert.doesNotMatch(component, /<GeckoArtwork/);
  assert.ok(GECKO_REAL_SPRITE.startsWith("data:image/webp;base64,UklGR"));

  const raster = Buffer.from(GECKO_REAL_SPRITE.split(",", 2)[1], "base64");
  assert.equal(raster.length, 101746);
  assert.equal(raster.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(raster.subarray(8, 12).toString("ascii"), "WEBP");
  assert.equal(createHash("sha256").update(raster).digest("hex"), EXPECTED_WEBP_SHA256);

  assert.match(css, /width:\s*800%/);
  assert.match(css, /height:\s*200%/);
  assert.match(css, /--gecko-column/);
  assert.match(css, /--gecko-row/);
});
