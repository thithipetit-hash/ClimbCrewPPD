import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const routesSource = await readFile(new URL("../admin-users/explicit-routes.js", import.meta.url), "utf8");
const preloadSource = await readFile(new URL("../admin-user-enhancements.js", import.meta.url), "utf8");

test("la route de qualification initiateur est enregistrée explicitement", () => {
  assert.match(
    routesSource,
    /app\.put\("\/admin\/participants\/:id\/qualifications", requireAuth, requireAdmin, updateParticipantInitiatorQualifications\)/,
  );
});

test("le preload ne surcharge plus express.application.listen", () => {
  assert.doesNotMatch(preloadSource, /application\.listen|installInitiatorQualificationIntegration/);
});
