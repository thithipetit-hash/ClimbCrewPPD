import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const privacySource = await readFile(new URL("../admin-users/participant-privacy-service.js", import.meta.url), "utf8");
const routesSource = await readFile(new URL("../realisation-technical-analysis-routes.js", import.meta.url), "utf8");

test("GET /realisations reste léger et ne sélectionne plus le JSON d'analyse", () => {
  const listSection = privacySource.split("export async function listRealisationsWithPrivacy")[1] || "";
  assert.doesNotMatch(listSection, /technical_analysis as/);
  assert.match(listSection, /GET \/realisations\/:id\/technical-analysis/);
});

test("l'analyse dispose d'une lecture dédiée avec confidentialité propriétaire/admin/public", () => {
  assert.match(routesSource, /app\.get\("\/realisations\/:id\/technical-analysis"/);
  assert.match(routesSource, /req\.auth\?\.user\?\.role === "admin"/);
  assert.match(routesSource, /String\(row\.participant_id \|\| ""\) === ownParticipantId/);
  assert.match(routesSource, /row\.profile_public === true/);
  assert.match(routesSource, /return res\.status\(404\)/);
});
