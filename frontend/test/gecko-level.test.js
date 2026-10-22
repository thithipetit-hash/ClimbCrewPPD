import test from "node:test";
import assert from "node:assert/strict";
import { GRADES } from "../../shared/climbing-grades.js";
import { GECKO_LEVEL_LABELS, getGeckoLevel, getGeckoLevelInfo } from "../src/lib/gecko-level.js";

test("les huit niveaux couvrent toutes les cotations du CPR, dès 7a pour l'Élite", () => {
  const gradesByLevel = [
    ["4", "4a", "4a+", "4b", "4b+", "4c", "4c+"],
    ["5a", "5a+", "5b", "5b+"],
    ["5c", "5c+"],
    ["6a", "6a+"],
    ["6b", "6b+"],
    ["6c"],
    ["6c+"],
    ["7a", "7a+", "7b", "7b+", "7c", "7c+"],
  ];

  assert.deepEqual(gradesByLevel.flat(), GRADES);
  assert.equal(GECKO_LEVEL_LABELS.length, gradesByLevel.length);
  gradesByLevel.forEach((grades, index) => {
    grades.forEach((grade) => {
      assert.equal(getGeckoLevel(grade), index + 1, `Niveau incorrect pour ${grade}`);
    });
  });
});

test("une cotation inconnue revient au niveau 1, avec normalisation de l'entrée", () => {
  assert.equal(getGeckoLevel(), 1);
  assert.equal(getGeckoLevel("nc"), 1);
  assert.equal(getGeckoLevel(" 6C+ "), 7);
  assert.equal(getGeckoLevel(" 7A "), 8);
});

test("la variante féminine adapte les libellés sans changer le niveau", () => {
  assert.deepEqual(getGeckoLevelInfo("6c", "F"), {
    level: 6,
    variant: "feminine",
    label: "Experte",
  });
  assert.deepEqual(getGeckoLevelInfo("6a", "H"), {
    level: 4,
    variant: "neutral",
    label: "Confirmé",
  });
  assert.equal(getGeckoLevelInfo("7a", "F").label, "Élite");
});
