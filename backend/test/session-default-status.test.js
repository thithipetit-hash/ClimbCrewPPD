import test from "node:test";
import assert from "node:assert/strict";
import { getDefaultSessionStatus } from "../../shared/session-default-status.js";

test("mardi midi et jeudi midi sont encadrés par défaut", () => {
  assert.equal(getDefaultSessionStatus("2026-09-01", "midi"), "encadree");
  assert.equal(getDefaultSessionStatus("2026-09-03", "midi"), "encadree");
});

test("les autres créneaux sont libres par défaut", () => {
  assert.equal(getDefaultSessionStatus("2026-09-01", "soir"), "libre");
  assert.equal(getDefaultSessionStatus("2026-09-02", "midi"), "libre");
});
