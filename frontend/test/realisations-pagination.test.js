import test from "node:test";
import assert from "node:assert/strict";

import {
  REALISATIONS_PAGE_SIZE,
  fetchPaginatedCollection,
  mergeSessionWindow,
} from "../src/lib/bootstrap-data.js";

test("les réalisations sont agrégées page par page sans changer leur ordre", async () => {
  const calls = [];
  const result = await fetchPaginatedCollection(async ({ limit, offset }) => {
    calls.push({ limit, offset });
    if (offset === 0) {
      return Array.from({ length: limit }, (_, index) => ({ id: `r-${index}` }));
    }
    return [{ id: "r-200" }, { id: "r-201" }];
  });

  assert.equal(REALISATIONS_PAGE_SIZE, 200);
  assert.deepEqual(calls, [
    { limit: 200, offset: 0 },
    { limit: 200, offset: 200 },
  ]);
  assert.equal(result.length, 202);
  assert.equal(result[0].id, "r-0");
  assert.equal(result.at(-1).id, "r-201");
});

test("l'hydratation différée reprend à la page 2 sans recharger la première page", async () => {
  const initialItems = Array.from(
    { length: REALISATIONS_PAGE_SIZE },
    (_, index) => ({ id: `r-${index}` }),
  );
  const calls = [];

  const result = await fetchPaginatedCollection(async ({ limit, offset }) => {
    calls.push({ limit, offset });
    return [{ id: "r-199" }, { id: "r-200" }, { id: "r-201" }];
  }, {
    pageSize: REALISATIONS_PAGE_SIZE,
    startOffset: REALISATIONS_PAGE_SIZE,
    initialItems,
  });

  assert.deepEqual(calls, [{ limit: 200, offset: 200 }]);
  assert.equal(result.length, 202);
  assert.equal(result.filter((item) => item.id === "r-199").length, 1);
  assert.equal(result.at(-1).id, "r-201");
});

test("une frontière de page déplacée pendant le chargement ne crée pas de doublon", async () => {
  const result = await fetchPaginatedCollection(async ({ limit, offset }) => {
    if (offset === 0) {
      return Array.from({ length: limit }, (_, index) => ({ id: `r-${index}` }));
    }
    return [{ id: "r-199" }, { id: "r-200" }];
  });

  assert.equal(result.length, 201);
  assert.equal(result.filter((item) => item.id === "r-199").length, 1);
});

test("un nombre exact de lignes égal à la taille de page déclenche une page vide de confirmation", async () => {
  const offsets = [];
  const result = await fetchPaginatedCollection(async ({ limit, offset }) => {
    offsets.push(offset);
    if (offset === 0) {
      return Array.from({ length: limit }, (_, index) => ({ id: `r-${index}` }));
    }
    return [];
  });

  assert.equal(result.length, 200);
  assert.deepEqual(offsets, [0, 200]);
});

test("une réponse paginée non tabulaire est refusée", async () => {
  await assert.rejects(
    () => fetchPaginatedCollection(async () => ({ rows: [] })),
    /réponse paginée doit être une collection/,
  );
});

test("la taille de page reste bornée par le contrat backend", async () => {
  await assert.rejects(
    () => fetchPaginatedCollection(async () => [], { pageSize: 201 }),
    /pageSize doit être compris entre 1 et 200/,
  );
});

test("un offset de reprise doit rester aligné sur la taille de page", async () => {
  await assert.rejects(
    () => fetchPaginatedCollection(async () => [], { startOffset: 1 }),
    /startOffset invalide/,
  );
});


test("le rafraîchissement du planning remplace seulement la fenêtre récente", () => {
  const previous = [
    { id: "old", date: "2026-01-15", slot: "midi", participantIds: ["1"] },
    { id: "inside-updated", date: "2026-09-28", slot: "midi", participantIds: ["1"] },
    { id: "inside-deleted", date: "2026-09-29", slot: "soir", participantIds: ["2"] },
    { id: "future", date: "2027-12-01", slot: "soir", participantIds: ["3"] },
  ];
  const refreshed = [
    { id: "inside-updated", date: "2026-09-28", slot: "midi", participantIds: ["1", "4"] },
    { id: "inside-new", date: "2026-10-01", slot: "matin", participantIds: [] },
  ];

  const result = mergeSessionWindow(previous, refreshed, {
    from: "2026-06-30",
    to: "2027-03-27",
  });

  assert.deepEqual(result.map((session) => session.id), [
    "old",
    "inside-updated",
    "inside-new",
    "future",
  ]);
  assert.deepEqual(
    result.find((session) => session.id === "inside-updated").participantIds,
    ["1", "4"],
  );
  assert.equal(
    result.some((session) => session.id === "inside-deleted"),
    false,
    "une séance supprimée dans la fenêtre doit disparaître localement",
  );
});

test("le rafraîchissement du planning ne touche pas aux réalisations historiques", () => {
  const state = {
    sessions: [{ id: "old", date: "2026-01-15", slot: "midi" }],
    realisations: Array.from({ length: 650 }, (_, index) => ({ id: `r-${index}` })),
  };

  const next = {
    ...state,
    sessions: mergeSessionWindow(state.sessions, [], {
      from: "2026-06-30",
      to: "2027-03-27",
    }),
  };

  assert.equal(next.realisations.length, 650);
  assert.equal(next.sessions[0].id, "old");
});
