import assert from "node:assert/strict";
import test from "node:test";
import {
  filterRouteDisplayGroups,
  matchesRouteRealisationFilter,
} from "./route-progress.js";

const leadRoute = { id: "voie-1", moulinetteOnly: false };
const moulinetteOnlyRoute = { id: "voie-2", moulinetteOnly: true };
const moulinette = { participantId: "p1", voieId: "voie-1", modeRealisation: "moulinette", styleRealisation: "travaillee" };
const leadAttempt = { participantId: "p1", voieId: "voie-1", modeRealisation: "en_tete", styleRealisation: "projet" };

test("les filtres de réalisations existants conservent leur union", () => {
  assert.equal(matchesRouteRealisationFilter([moulinette], leadRoute, ["mode:en_tete", "mode:moulinette"]), true);
  assert.equal(matchesRouteRealisationFilter([], leadRoute, ["none"]), true);
  assert.equal(matchesRouteRealisationFilter([moulinette], leadRoute, ["none"]), false);
});

test("jamais en tête inclut les voies essayées en moulinette mais pas en tête", () => {
  assert.equal(matchesRouteRealisationFilter([moulinette], leadRoute, [], ["mode:en_tete"]), true);
  assert.equal(matchesRouteRealisationFilter([leadAttempt], leadRoute, [], ["mode:en_tete"]), false);
  assert.equal(matchesRouteRealisationFilter([], leadRoute, [], ["mode:en_tete"]), true);
});

test("jamais en tête exclut les voies réservées à la moulinette", () => {
  assert.equal(matchesRouteRealisationFilter([], moulinetteOnlyRoute, [], ["mode:en_tete"]), false);
  assert.equal(matchesRouteRealisationFilter([], { ...moulinetteOnlyRoute, moulinetteOnly: false, moulinette_only: true }, [], ["mode:en_tete"]), false);
});

test("les exclusions de critères fonctionnent sur plusieurs types sans fausse combinaison", () => {
  const flash = { ...moulinette, styleRealisation: "flash" };
  assert.equal(matchesRouteRealisationFilter([flash], leadRoute, [], ["criterion:a_vue"]), true);
  assert.equal(matchesRouteRealisationFilter([flash], leadRoute, [], ["criterion:a_vue", "criterion:flash"]), false);
  assert.equal(matchesRouteRealisationFilter([moulinette], leadRoute, ["mode:moulinette"], ["criterion:flash"]), true);
  assert.equal(matchesRouteRealisationFilter([flash], leadRoute, ["mode:moulinette"], ["criterion:flash"]), false);
});

test("le filtrage conserve le regroupement par corde et les voies concernées", () => {
  const groups = [{ key: "corde-1", label: "Corde 1", routes: [leadRoute, moulinetteOnlyRoute] }];
  const byRoute = new Map([["voie-1", [moulinette]]]);
  const filtered = filterRouteDisplayGroups(groups, byRoute, [], ["mode:en_tete"]);
  assert.deepEqual(filtered.map((group) => group.routes.map((route) => route.id)), [["voie-1"]]);
  assert.equal(groups[0].routes.length, 2);
});
