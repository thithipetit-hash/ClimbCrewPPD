import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("les statistiques utilisent l'état métier canonique et jamais un cache local fantôme", async () => {
  const [statistics, businessState] = await Promise.all([
    readFile(new URL("../src/pages/Statistiques.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/hooks/useAppBusinessState.js", import.meta.url), "utf8"),
  ]);
  assert.match(statistics, /sessions = \[\]/);
  assert.doesNotMatch(statistics, /localStorage|climbcrew_local_data_v2|readStoredSessions/);
  assert.match(businessState, /storage\?\.removeItem\(BUSINESS_STORAGE_KEY\)/);
});

test("la suppression participant attend la confirmation serveur avant de modifier l'état local", async () => {
  const source = await readFile(new URL("../src/hooks/useParticipantManagement.js", import.meta.url), "utf8");
  const apiCall = source.indexOf("await apiFetch");
  const applyDeletion = source.indexOf("applyParticipantDeletion(id)", apiCall);
  assert.ok(apiCall >= 0 && applyDeletion > apiCall);
  assert.match(source, /Une suppression destructive n'est jamais optimiste/);
});

test("le bootstrap charge d'abord une fenêtre de séances puis hydrate l'historique", async () => {
  const source = await readFile(new URL("../src/hooks/useAppBootstrap.js", import.meta.url), "utf8");
  assert.match(source, /SESSION_WINDOW_PAST_DAYS = 90/);
  assert.match(source, /SESSION_WINDOW_FUTURE_DAYS = 180/);
  assert.match(source, /recentSessionsPath/);
  assert.match(source, /hydrateSessions/);
});

test("les opérations de réalisations du Profil sont extraites", async () => {
  const [profile, hook] = await Promise.all([
    readFile(new URL("../src/pages/Profil.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/hooks/useProfileRealisations.js", import.meta.url), "utf8"),
  ]);
  assert.match(profile, /useProfileRealisations/);
  assert.doesNotMatch(profile, /async function importTheCragFile/);
  assert.match(hook, /apiUpload/);
  assert.match(hook, /deleteOwnRealisation/);
});
