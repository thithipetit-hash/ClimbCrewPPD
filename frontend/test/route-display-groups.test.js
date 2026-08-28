import test from "node:test";
import assert from "node:assert/strict";
import { buildRouteDisplayGroups } from "../src/lib/route-display-groups.js";

test("regroupe les voies par corde en conservant la couleur", () => {
  const groups = buildRouteDisplayGroups({
    routes: [
      { id: "r2", numeroCorde: 2, cotationReference: "6a" },
      { id: "r1", numeroCorde: 1, cotationReference: "5c" },
      { id: "r3", numeroCorde: "2", cotationReference: "6b" },
    ],
    ropes: [
      { numeroCorde: 1, couleurCorde: "bleue" },
      { numeroCorde: 2, couleurCorde: "rouge" },
    ],
    sortMode: "corde",
  });

  assert.deepEqual(groups.map((group) => group.key), ["corde-1", "corde-2"]);
  assert.equal(groups[0].label, "Corde 1 · bleue");
  assert.deepEqual(groups[1].routes.map((route) => route.id), ["r2", "r3"]);
});

test("regroupe les voies par cotation dans l'ordre métier", () => {
  const groups = buildRouteDisplayGroups({
    routes: [
      { id: "r1", numeroCorde: 1, cotationReference: "6b" },
      { id: "r2", numeroCorde: 2, cotationReference: "6a+" },
      { id: "r3", numeroCorde: 3, cotationAjustee: "6a" },
      { id: "r4", numeroCorde: 4, cotationReference: "nc" },
    ],
    sortMode: "cotation",
  });

  assert.deepEqual(groups.slice(0, 3).map((group) => group.label), [
    "Cotation 6a",
    "Cotation 6a+",
    "Cotation 6b",
  ]);
  assert.equal(groups.at(-1).label, "Cotation nc");
});
