import test from "node:test";
import assert from "node:assert/strict";
import { calculateClimberProfile, recommendRoutesForNextSession } from "../src/lib/climber-profile.js";

const routes = [
  { id: "r1", numeroCorde: 1, cotationReference: "5c", cotationAjustee: "5c", tags: ["dalle", "technique"] },
  { id: "r2", numeroCorde: 2, cotationReference: "6a", cotationAjustee: "6a", tags: ["dalle", "technique"] },
  { id: "r3", numeroCorde: 3, cotationReference: "6a", cotationAjustee: "6a", tags: ["devers", "physique"] },
  { id: "r4", numeroCorde: 4, cotationReference: "6a+", cotationAjustee: "6a+", tags: ["devers", "continuite"] },
  { id: "r5", numeroCorde: 5, cotationReference: "6b", cotationAjustee: "6b", tags: ["devers", "a_doigts"] },
  { id: "r6", numeroCorde: 6, cotationReference: "6b", cotationAjustee: "6b", tags: ["technique", "engagee"] },
  { id: "r7", numeroCorde: 7, cotationReference: "6b+", cotationAjustee: "6b+", tags: ["physique", "morphologique"] },
];
const routesById = Object.fromEntries(routes.map((route) => [route.id, route]));

test("le profil met en évidence les caractéristiques", () => {
  const realisations = [
    { id: "a", voieId: "r2", styleRealisation: "a_vue", modeRealisation: "en_tete" },
    { id: "b", voieId: "r3", styleRealisation: "projet", modeRealisation: "en_tete" },
    { id: "c", voieId: "r5", styleRealisation: "non_enchainee", modeRealisation: "en_tete" },
  ];
  const profile = calculateClimberProfile({ realisations, routesById, cprGrade: "6a" });
  const technique = profile.characteristics.find((item) => item.value === "technique");
  const devers = profile.characteristics.find((item) => item.value === "devers");
  assert.ok(technique.score > devers.score);
  assert.equal(technique.attempts, 1);
  assert.equal(devers.attempts, 2);
  assert.ok(profile.priorityTags.some((item) => item.value === "devers"));
});

test("les recommandations sont cinq voies distinctes", () => {
  const realisations = [
    { id: "a", voieId: "r2", styleRealisation: "a_vue", modeRealisation: "en_tete" },
    { id: "b", voieId: "r3", styleRealisation: "projet", modeRealisation: "en_tete" },
  ];
  const profile = calculateClimberProfile({ realisations, routesById, cprGrade: "6a" });
  const recommendations = recommendRoutesForNextSession({ routes, realisations, routesById, cprGrade: "6a", profile, limit: 5 });
  assert.equal(recommendations.length, 5);
  assert.equal(new Set(recommendations.map((item) => item.route.id)).size, 5);
  assert.ok(!recommendations.some((item) => item.route.id === "r2"));
  assert.ok(recommendations.some((item) => item.route.id === "r3"));
});

test("sans historique la sélection commence par les cotations accessibles", () => {
  const recommendations = recommendRoutesForNextSession({ routes, realisations: [], routesById, cprGrade: "", limit: 5 });
  assert.equal(recommendations.length, 5);
  assert.equal(recommendations[0].route.id, "r1");
});
