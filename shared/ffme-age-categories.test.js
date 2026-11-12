import assert from "node:assert/strict";
import test from "node:test";
import { FFME_ADULT_CATEGORIES, getFfmeAgeCategory, getFfmeSeasonYear } from "./ffme-age-categories.js";

test("la saison FFME change au 1er septembre", () => {
  assert.equal(getFfmeSeasonYear(new Date("2026-08-31T12:00:00Z")), 2026);
  assert.equal(getFfmeSeasonYear(new Date("2026-09-01T12:00:00Z")), 2027);
});

test("catégories d'âge escalade FFME pour la saison 2026-2027", () => {
  const examples = [
    [2009, "U19"],
    [2010, "U19"],
    [2008, "U21"],
    [2007, "U21"],
    [2006, "Sénior"],
    [1988, "Sénior"],
    [1987, "Vétéran 1"],
    [1978, "Vétéran 1"],
    [1977, "Vétéran 2"],
  ];
  for (const [year, expected] of examples) {
    assert.equal(getFfmeAgeCategory(year, 2027), expected);
  }
  assert.deepEqual(FFME_ADULT_CATEGORIES, ["U19", "U21", "Sénior", "Vétéran 1", "Vétéran 2"]);
});

test("l'année de naissance reste facultative", () => {
  assert.equal(getFfmeAgeCategory(null, 2027), "");
  assert.equal(getFfmeAgeCategory("", 2027), "");
  assert.equal(getFfmeAgeCategory("invalide", 2027), "");
  assert.equal(getFfmeAgeCategory(2012, 2027), "");
});
