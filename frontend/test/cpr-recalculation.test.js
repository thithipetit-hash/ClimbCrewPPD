import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { recalculateOwnStatisticsAndCpr } from "../src/lib/cpr-recalculation.js";

test("le recalcul restaure l'historique du compte puis recharge les statistiques complètes", async () => {
  const operations = [];
  await recalculateOwnStatisticsAndCpr({
    participantId: "42",
    request: async (path, options) => {
      operations.push([path, options.method]);
      return { ok: true, cprResetAt: null };
    },
    reloadApiState: async (options) => {
      operations.push(["reload", options.requireComplete]);
      return { participants: [{ id: "42", cprResetAt: null }] };
    },
  });
  assert.deepEqual(operations, [
    ["/participants/me/statistics/recalculate", "POST"],
    ["reload", true],
  ]);
});

test("le recalcul est refusé sans compte associé et sans requête serveur", async () => {
  let requested = false;
  await assert.rejects(
    recalculateOwnStatisticsAndCpr({
      participantId: "",
      request: async () => { requested = true; },
    }),
    /associé/,
  );
  assert.equal(requested, false);
});

test("un acquittement serveur absent n'est pas présenté comme un recalcul réussi", async () => {
  let reloaded = false;
  await assert.rejects(
    recalculateOwnStatisticsAndCpr({
      participantId: "42",
      request: async () => ({ ok: true, cprResetAt: "2026-10-25T00:00:00Z" }),
      reloadApiState: async () => { reloaded = true; },
    }),
    /confirmation serveur/,
  );
  assert.equal(reloaded, false);
});

test("le recalcul attend que le serveur confirme le CPR du bon grimpeur", async () => {
  await assert.rejects(
    recalculateOwnStatisticsAndCpr({
      participantId: "42",
      request: async () => ({ ok: true, cprResetAt: null }),
      reloadApiState: async () => ({ participants: [{ id: "17", cprResetAt: null }] }),
    }),
    /Actualisez la page/,
  );
});

test("le profil propose le recalcul mais plus la réinitialisation du CPR", async () => {
  const [profil, app] = await Promise.all([
    readFile(new URL("../src/pages/Profil.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(profil, /Recalculer mes statistiques et mon CPR/);
  assert.doesNotMatch(profil, /Réinitialiser mon CPR|onResetCpr|handleResetOwnCpr|cprResetting/);
  assert.doesNotMatch(app, /onResetCpr=|async function resetMyCpr/);
});
