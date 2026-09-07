import test from "node:test";
import assert from "node:assert/strict";

import {
  REALISATIONS_PAGE_SIZE,
  fetchPaginatedCollection,
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
