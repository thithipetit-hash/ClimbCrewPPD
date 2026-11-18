import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("chaque voie peut afficher puis masquer tous ses détails", async () => {
  const voies = await readFile(new URL("../src/pages/Voies.jsx", import.meta.url), "utf8");

  assert.match(voies, /expandedRouteIds/);
  assert.match(voies, /toggleRouteDetails\(routeId\)/);
  assert.match(voies, /aria-expanded=\{isExpanded\}/);
  assert.match(voies, /onClick=\{\(\) => toggleRouteDetails\(route\.id\)\}/);
  assert.match(voies, /event\.key !== "Enter" && event\.key !== " "/);
  assert.match(voies, /Détails complets de la voie/);
  for (const label of [
    "Nom :",
    "Corde :",
    "Couleur :",
    "Ouvreur :",
    "Cotation de référence :",
    "Cotation ajustée :",
    "Consensus :",
    "Type :",
    "Caractéristiques :",
    "Note :",
    "Vidéos :",
  ]) {
    assert.match(voies, new RegExp(label));
  }
  assert.match(voies, /formatRouteProgress\(myRouteProgress, route\)/);
});
