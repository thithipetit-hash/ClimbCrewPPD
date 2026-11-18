import test from "node:test";
import assert from "node:assert/strict";

import { useRealisationPersistence } from "../src/hooks/useRealisationPersistence.js";
import {
  getSessionParticipantChanges,
  hasSessionMetadataChanges,
  useSessionPersistence,
} from "../src/hooks/useSessionPersistence.js";

function createStore(initialState) {
  let state = initialState;
  return {
    get: () => state,
    set: (update) => {
      state = typeof update === "function" ? update(state) : update;
    },
  };
}

function createDeferredRequestQueue() {
  const pending = [];
  const request = (path, options) => new Promise((resolve, reject) => {
    pending.push({ path, options, resolve, reject });
  });
  return { pending, request };
}

async function waitForPending(network, expectedCount) {
  for (let attempt = 0; attempt < 20 && network.pending.length < expectedCount; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(network.pending.length, expectedCount);
}

test("les sauvegardes de séance sont sérialisées et un premier échec ne remplace pas une seconde modification", async () => {
  const initial = {
    id: "2026-09-28-midi",
    date: "2026-09-28",
    slot: "midi",
    status: "encadree",
    participantIds: [],
  };
  const firstUpdate = { ...initial, participantIds: ["1"] };
  const secondUpdate = { ...firstUpdate, participantIds: ["1", "2"] };
  const store = createStore({ sessions: [initial] });
  const network = createDeferredRequestQueue();
  const errors = [];
  const successes = [];

  const { persistSessionChange } = useSessionPersistence({
    useApi: true,
    setState: store.set,
    request: network.request,
    onSuccess: (message) => successes.push(message),
    onError: (message) => errors.push(message),
  });

  const firstSave = persistSessionChange(initial.id, initial, firstUpdate, true);
  const secondSave = persistSessionChange(initial.id, firstUpdate, secondUpdate, true);

  await waitForPending(network, 1);

  network.pending[0].reject(new Error("échec simulé"));
  await firstSave;
  await waitForPending(network, 2);

  assert.deepEqual(store.get().sessions[0], secondUpdate, "le rollback ne doit pas effacer la modification plus récente");

  network.pending[1].resolve({ ok: true });
  await secondSave;

  assert.deepEqual(store.get().sessions[0], secondUpdate);
  assert.equal(errors.length, 1);
  assert.equal(successes.length, 1);
  assert.deepEqual(
    network.pending.map(({ path, options }) => ({ path, method: options.method })),
    [
      { path: "/sessions/2026-09-28-midi/participants/1", method: "POST" },
      { path: "/sessions/2026-09-28-midi/participants/2", method: "POST" },
    ],
    "chaque inscription doit être une mutation atomique indépendante",
  );
});

test("les sauvegardes de réalisation restent ordonnées et conservent la dernière version optimiste", async () => {
  const initial = {
    id: "real-behavior-1",
    participantId: "12",
    sessionId: "2026-09-28-midi",
    voieId: "voie-1",
    commentaire: "",
    rating: null,
  };
  const store = createStore({ realisations: [initial] });
  const network = createDeferredRequestQueue();
  const errors = [];

  const common = {
    useApi: true,
    authUser: { id: "user-12" },
    setState: store.set,
    myParticipantId: "12",
    sessionsById: {},
    request: network.request,
    onError: (message) => errors.push(message),
  };

  const firstController = useRealisationPersistence({ ...common, state: store.get() });
  const firstSave = firstController(initial.id, { commentaire: "première modification" });

  await waitForPending(network, 1);

  const secondController = useRealisationPersistence({ ...common, state: store.get() });
  const secondSave = secondController(initial.id, { rating: 5 });

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(network.pending.length, 1, "la seconde requête doit rester dans la file");
  assert.equal(store.get().realisations[0].commentaire, "première modification");
  assert.equal(store.get().realisations[0].rating, 5);

  network.pending[0].reject(new Error("échec simulé"));
  await firstSave;
  await waitForPending(network, 2);

  assert.equal(store.get().realisations[0].commentaire, "première modification");
  assert.equal(store.get().realisations[0].rating, 5);

  network.pending[1].resolve({ ok: true });
  await secondSave;

  assert.equal(errors.length, 1);
  assert.equal(store.get().realisations[0].rating, 5);
  assert.deepEqual(
    network.pending.map(({ options }) => JSON.parse(options.body)),
    [{ commentaire: "première modification" }, { rating: 5 }],
  );
});


test("les différences d'inscriptions sont calculées sans modifier les métadonnées", () => {
  const previous = {
    id: "2026-09-28-midi",
    date: "2026-09-28",
    slot: "midi",
    status: "libre",
    encadrantId: null,
    referentId: null,
    participantIds: ["1", "2"],
  };
  const updated = {
    ...previous,
    participantIds: ["2", "3"],
  };

  assert.deepEqual(getSessionParticipantChanges(previous, updated), {
    added: ["3"],
    removed: ["1"],
  });
  assert.equal(hasSessionMetadataChanges(previous, updated), false);
});

test("une modification de métadonnées n'envoie jamais la liste des inscrits dans le PUT", async () => {
  const initial = {
    id: "2026-09-28-soir",
    date: "2026-09-28",
    slot: "soir",
    status: "fermee",
    encadrantId: null,
    referentId: null,
    participantIds: ["1", "2"],
  };
  const updated = { ...initial, status: "libre" };
  const store = createStore({ sessions: [initial] });
  const calls = [];

  const { persistSessionChange } = useSessionPersistence({
    useApi: true,
    setState: store.set,
    request: async (path, options) => {
      calls.push({ path, options });
      return { ok: true };
    },
  });

  await persistSessionChange(initial.id, initial, updated, true);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, "/sessions/2026-09-28-soir");
  assert.equal(calls[0].options.method, "PUT");
  const metadataPayload = JSON.parse(calls[0].options.body);
  assert.deepEqual(metadataPayload.participantIds, []);
  assert.equal(metadataPayload.participantMode, "preserve");
});
