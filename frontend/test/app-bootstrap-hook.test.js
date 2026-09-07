import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { mergeBootstrapCollections } from "../src/lib/bootstrap-data.js";

const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const hook = fs.readFileSync(new URL("../src/hooks/useAppBootstrap.js", import.meta.url), "utf8");

test("App délègue le bootstrap API et authentification", () => {
  assert.match(app, /useAppBootstrap\(/);
  assert.doesNotMatch(app, /authApiFetch|authToken|setAuthToken/);
  assert.doesNotMatch(app, /Recharge toutes les données depuis le backend/);
});

test("le hook attend l'identité avant de charger une seule fois les données métier", () => {
  assert.match(hook, /apiFetch\("\/auth\/me"/);
  assert.match(hook, /BUSINESS_BOOTSTRAP_ENDPOINTS\.map/);
  assert.equal((hook.match(/reloadApiState\(\{ isMounted/g) || []).length, 1);
  assert.match(hook, /apiFetch\("\/auth\/broadcast-messages\/pending"/);
  assert.doesNotMatch(hook, /authApiFetch|authToken|setAuthToken/);
  assert.match(hook, /return \{ reloadApiState \}/);
});

test("les réalisations utilisent le contrat limit offset préparé par le backend", () => {
  assert.match(hook, /fetchPaginatedCollection\(/);
  assert.match(hook, /\?limit=\$\{limit\}&offset=\$\{offset\}/);
  assert.match(hook, /pageSize: REALISATIONS_PAGE_SIZE/);
});

test("une collection vide réussie remplace les anciennes données", () => {
  const previous = {
    participants: [{ id: "p1" }],
    sessions: [{ id: "s1" }],
    realisations: [{ id: "r1" }],
    ropes: [{ numeroCorde: 1 }],
    routes: [{ id: "v1" }],
  };
  const settled = [
    { status: "fulfilled", value: [] },
    { status: "fulfilled", value: [] },
    { status: "fulfilled", value: [] },
    { status: "fulfilled", value: [] },
    { status: "fulfilled", value: [] },
  ];
  const next = mergeBootstrapCollections(previous, settled);
  assert.deepEqual(next.participants, []);
  assert.deepEqual(next.sessions, []);
  assert.deepEqual(next.realisations, []);
  assert.deepEqual(next.ropes, []);
  assert.deepEqual(next.routes, []);
});

test("une requête en échec conserve seulement sa collection précédente", () => {
  const previous = {
    participants: [{ id: "p1" }],
    sessions: [{ id: "s1" }],
    realisations: [],
    ropes: [],
    routes: [],
  };
  const settled = [
    { status: "fulfilled", value: [] },
    { status: "rejected", reason: new Error("sessions down") },
    { status: "fulfilled", value: [] },
    { status: "fulfilled", value: [] },
    { status: "fulfilled", value: [] },
  ];
  const next = mergeBootstrapCollections(previous, settled);
  assert.deepEqual(next.participants, []);
  assert.deepEqual(next.sessions, previous.sessions);
});
