import test from "node:test";
import assert from "node:assert/strict";

import { GRADES, calculateSimpleCpr } from "../src/lib/domain.js";

test("le CPR pondère la moulinette à 85 % sans bonus lié au critère", () => {
  const now = new Date("2026-10-05T12:00:00Z").getTime();
  const routesById = { v1: { id: "v1", cotationAjustee: "6a" } };

  const lead = calculateSimpleCpr([
    {
      id: "lead",
      voieId: "v1",
      dateRealisation: "2026-10-04",
      modeRealisation: "en_tete",
      styleRealisation: "a_vue",
    },
  ], routesById, now);

  const workedLead = calculateSimpleCpr([
    {
      id: "worked",
      voieId: "v1",
      dateRealisation: "2026-10-04",
      modeRealisation: "en_tete",
      styleRealisation: "travaillee",
    },
  ], routesById, now);

  const topRope = calculateSimpleCpr([
    {
      id: "top",
      voieId: "v1",
      dateRealisation: "2026-10-04",
      modeRealisation: "moulinette",
      styleRealisation: "a_vue",
    },
  ], routesById, now);

  const gradeIndex = GRADES.indexOf("6a");
  assert.equal(lead.averageIndex, gradeIndex);
  assert.equal(workedLead.averageIndex, gradeIndex);
  assert.equal(topRope.averageIndex, gradeIndex * 0.85);
  assert.equal(lead.currentGrade, "6a");
  assert.equal(topRope.currentGrade, "5c");
});

test("le recalcul après reset reprend l'historique existant sans modifier la formule", () => {
  const now = new Date("2026-10-29T21:00:00Z").getTime();
  const routesById = { voie: { id: "voie", cotationAjustee: "6b" } };
  const realisations = [{
    id: "ancienne",
    voieId: "voie",
    dateRealisation: "2026-10-20",
    createdAt: "2026-10-20T10:00:00Z",
    modeRealisation: "en_tete",
    styleRealisation: "a_vue",
  }];
  const resetAt = "2026-10-25T12:00:00Z";
  assert.equal(calculateSimpleCpr(realisations, routesById, now, resetAt).currentGrade, null);
  assert.equal(calculateSimpleCpr(realisations, routesById, now, null).currentGrade, "6b");
});
