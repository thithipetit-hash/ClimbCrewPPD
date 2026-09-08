import assert from "node:assert/strict";
import test from "node:test";

import { getDefaultSessionStatus } from "../../shared/session-default-status.js";

test("mardi et jeudi midi sont encadrés", () => {
  assert.equal(getDefaultSessionStatus("2026-09-01", "midi"), "encadree");
  assert.equal(getDefaultSessionStatus("2026-09-03", "midi"), "encadree");
});

test("les autres créneaux restent libres", () => {
  assert.equal(getDefaultSessionStatus("2026-09-01", "matin"), "libre");
  assert.equal(getDefaultSessionStatus("2026-09-01", "soir"), "libre");
  assert.equal(getDefaultSessionStatus("2026-09-02", "midi"), "libre");
  assert.equal(getDefaultSessionStatus("2026-09-05", "midi"), "libre");
});
