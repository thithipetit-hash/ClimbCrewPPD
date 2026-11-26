import assert from "node:assert/strict";
import test from "node:test";
import { getPassportDotLabel, getPassportDotStyle } from "../src/lib/domain.js";

test("une pastille de passeport gris clair reste pleine même sans FFME", () => {
  for (const passport of ["sans", "gris", "", undefined]) {
    const dot = getPassportDotStyle({ passport, ffme: false });
    assert.equal(dot.backgroundColor, "#cbd5e1");
    assert.equal(dot.backgroundImage, "none");
  }
});

test("les pastilles de couleur conservent le demi-remplissage sans FFME", () => {
  const withoutLicence = getPassportDotStyle({ passport: "jaune", ffme: false });
  assert.equal(withoutLicence.backgroundColor, "transparent");
  assert.match(withoutLicence.backgroundImage, /linear-gradient/);

  const withLicence = getPassportDotStyle({ passport: "jaune", ffme: true });
  assert.equal(withLicence.backgroundImage, "none");
  assert.equal(withLicence.backgroundColor, "#fde047");
});

test("la marque Découverte conserve une pastille pleine et la lettre D", () => {
  const participant = { passport: "sans", ffme: false, passportDecouverte: true };
  assert.equal(getPassportDotStyle(participant).backgroundImage, "none");
  assert.equal(getPassportDotLabel(participant), "D");
});
