import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  evaluateSessionMutation,
  registerParticipantForSession,
} from "../admin-users/session-authorization-service.js";
import { sessionDbToApi } from "../session-read-routes.js";
import {
  getSchedulerHealthSnapshot,
  markSchedulerDegraded,
  markSchedulerDisabled,
  markSchedulerHealthy,
} from "../scheduler-health.js";

test("la règle d'inscription centralisée refuse une séance fermée et une séance pleine", async () => {
  await assert.rejects(
    registerParticipantForSession({}, {
      sessionId: "fermee",
      participantId: "19",
      session: { id: "fermee", status: "fermee", encadrant_id: null, referent_id: null },
      participantIds: [],
    }),
    /fermée/i,
  );

  const full = Array.from({ length: 18 }, (_, index) => String(index + 1));
  await assert.rejects(
    registerParticipantForSession({}, {
      sessionId: "pleine",
      participantId: "19",
      session: { id: "pleine", status: "encadree", encadrant_id: null, referent_id: null },
      participantIds: full,
    }),
    /18 participants/i,
  );
});

test("encadrant et référent sont déjà présents sans inscription explicite", async () => {
  const queries = [];
  const client = {
    query: async (sql, params = []) => {
      queries.push({ text: String(sql), params });
      throw new Error("Aucune requête d'inscription ne doit être exécutée pour un rôle déjà présent.");
    },
  };

  const encadrant = await registerParticipantForSession(client, {
    sessionId: "encadree",
    participantId: "7",
    session: { id: "encadree", status: "encadree", encadrant_id: "7", referent_id: null },
    participantIds: [],
  });
  const referent = await registerParticipantForSession(client, {
    sessionId: "libre",
    participantId: "8",
    session: { id: "libre", status: "libre", encadrant_id: null, referent_id: "8" },
    participantIds: [],
  });

  assert.equal(encadrant.registered, false);
  assert.equal(referent.registered, false);
  assert.equal(queries.length, 0);
});

test("l'API des séances conserve l'ordre fourni et n'ajoute pas les rôles aux inscrits", async () => {
  const mapped = sessionDbToApi({
    id: "2026-09-29-soir",
    date: "2026-09-29",
    slot: "soir",
    status: "encadree",
    encadrant_id: "7",
    referent_id: "8",
  }, ["12", "3", "9", "12"]);

  assert.deepEqual(mapped.participantIds, ["12", "3", "9"]);
  assert.equal(mapped.participantIds.includes("7"), false);
  assert.equal(mapped.participantIds.includes("8"), false);

  const routes = await readFile(new URL("../session-read-routes.js", import.meta.url), "utf8");
  assert.match(routes, /join sessions s on s\.id = sp\.session_id/);
  assert.match(routes, /where \(\$1::date is null or s\.date >= \$1::date\)/);
  assert.match(routes, /order by sp\.session_id asc, sp\.created_at asc, sp\.participant_id asc/);
});

test("TheCrag réutilise la règle d'inscription et le statut métier par défaut", async () => {
  const [routes, importer] = await Promise.all([
    readFile(new URL("../realisation-management-routes.js", import.meta.url), "utf8"),
    readFile(new URL("../thecrag-import-service.js", import.meta.url), "utf8"),
  ]);
  assert.match(routes, /importTheCragRealisations/);
  assert.match(importer, /registerParticipantForSession/);
  assert.match(importer, /getDefaultSessionStatus\(date, "midi"\)/);
});

test("le mode de réalisation possède sa colonne et la suppression de voie est restrictive", async () => {
  const migration = await readFile(
    new URL("../database/migrations/024_realisation_mode_route_history.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /mode_realisation/);
  assert.match(migration, /update realisations[\s\S]*set nb_essais = null/);
  assert.match(migration, /foreign key \(voie_id\) references routes\(id\)[\s\S]*on delete restrict/);
});

test("l'état des schedulers expose explicitement un mode dégradé", () => {
  markSchedulerHealthy("test-healthy");
  markSchedulerDisabled("test-disabled");
  markSchedulerDegraded("test-degraded");
  let snapshot = getSchedulerHealthSnapshot();
  assert.equal(snapshot.degraded, true);
  assert.equal(snapshot.schedulers.find((item) => item.name === "test-disabled")?.status, "disabled");

  markSchedulerHealthy("test-degraded");
  snapshot = getSchedulerHealthSnapshot();
  assert.equal(snapshot.schedulers.find((item) => item.name === "test-degraded")?.status, "healthy");
});


test("un encadrant ou référent peut créer et typer une séance", () => {
  const base = {
    existingSession: null,
    previousParticipantIds: [],
    actorParticipantId: "7",
    isAdmin: false,
  };

  assert.equal(evaluateSessionMutation({
    ...base,
    requestedSession: { id: "2026-09-29-soir", date: "2026-09-29", slot: "soir", status: "libre", participantIds: [] },
    canEncadrer: true,
    canReferer: false,
  }).allowed, true);

  assert.equal(evaluateSessionMutation({
    ...base,
    requestedSession: { id: "2026-09-29-soir", date: "2026-09-29", slot: "soir", status: "encadree", participantIds: [] },
    canEncadrer: true,
    canReferer: false,
  }).allowed, true);

  assert.equal(evaluateSessionMutation({
    ...base,
    requestedSession: { id: "2026-09-29-soir", date: "2026-09-29", slot: "soir", status: "libre", participantIds: [] },
    canEncadrer: false,
    canReferer: true,
  }).allowed, true);

  assert.equal(evaluateSessionMutation({
    ...base,
    requestedSession: { id: "2026-09-29-soir", date: "2026-09-29", slot: "soir", status: "encadree", participantIds: [] },
    canEncadrer: false,
    canReferer: true,
  }).allowed, true);
});
