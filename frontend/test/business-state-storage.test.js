import test from "node:test";
import assert from "node:assert/strict";

import {
  BUSINESS_STORAGE_KEY,
  loadInitialBusinessState,
  persistBusinessState,
} from "../src/hooks/useAppBusinessState.js";

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    has(key) {
      return values.has(key);
    },
    value(key) {
      return values.get(key);
    },
  };
}

test("le mode API supprime les anciennes données métier du navigateur", () => {
  const storage = createStorage({
    [BUSINESS_STORAGE_KEY]: JSON.stringify({ participants: [{ id: "1", nom: "Test" }] }),
  });

  const state = loadInitialBusinessState({ useApi: true, storage });

  assert.equal(storage.has(BUSINESS_STORAGE_KEY), false);
  assert.deepEqual(state.participants, []);
  assert.deepEqual(state.sessions, []);
  assert.deepEqual(state.realisations, []);
});

test("le mode API ne persiste jamais l'état métier", () => {
  const storage = createStorage();
  persistBusinessState({ participants: [{ id: "1" }] }, { useApi: true, storage });
  assert.equal(storage.has(BUSINESS_STORAGE_KEY), false);
});

test("le mode local conserve la persistance historique", () => {
  const storage = createStorage();
  const state = { participants: [{ id: "local-1" }], sessions: [] };

  persistBusinessState(state, { useApi: false, storage });

  assert.equal(storage.value(BUSINESS_STORAGE_KEY), JSON.stringify(state));
});
