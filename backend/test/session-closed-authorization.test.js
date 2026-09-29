import test from "node:test";
import assert from "node:assert/strict";
import { assertSessionCapacity, evaluateSessionMutation } from "../admin-users/session-authorization-service.js";

function baseSession(overrides = {}) {
  return {
    id: "session-test",
    date: "2026-08-24",
    slot: "soir",
    status: "fermee",
    encadrant_id: null,
    referent_id: null,
    ...overrides,
  };
}

function requestedSession(overrides = {}) {
  return {
    id: "session-test",
    date: "2026-08-24",
    slot: "soir",
    status: "fermee",
    encadrantId: null,
    referentId: null,
    participantIds: ["42"],
    ...overrides,
  };
}

test("un membre ne peut pas rejoindre une séance fermée", () => {
  const result = evaluateSessionMutation({
    existingSession: baseSession(),
    requestedSession: requestedSession(),
    previousParticipantIds: [],
    actorParticipantId: "42",
    isAdmin: false,
  });

  assert.equal(result.allowed, false);
  assert.equal(result.status, 409);
  assert.match(result.error, /séance est fermée/i);
});

test("un membre déjà inscrit peut toujours quitter une séance fermée", () => {
  const result = evaluateSessionMutation({
    existingSession: baseSession(),
    requestedSession: requestedSession({ participantIds: [] }),
    previousParticipantIds: ["42"],
    actorParticipantId: "42",
    isAdmin: false,
  });

  assert.equal(result.allowed, true);
  assert.equal(result.actorLeaves, true);
  assert.equal(result.actorJoins, false);
});

test("un encadrant peut ouvrir la séance en libre puis s'inscrire dans la même mutation", () => {
  const result = evaluateSessionMutation({
    existingSession: baseSession(),
    requestedSession: requestedSession({ status: "libre" }),
    previousParticipantIds: [],
    actorParticipantId: "42",
    isAdmin: false,
    canEncadrer: true,
  });

  assert.equal(result.allowed, true);
  assert.equal(result.statusChanged, true);
  assert.equal(result.actorJoins, true);
});

test("un référent peut passer une séance au statut libre", () => {
  const result = evaluateSessionMutation({
    existingSession: baseSession(),
    requestedSession: requestedSession({ status: "libre", participantIds: [] }),
    previousParticipantIds: [],
    actorParticipantId: "42",
    canReferer: true,
  });

  assert.equal(result.allowed, true);
  assert.equal(result.statusChanged, true);
});

test("un référent ne peut pas passer une séance dans un statut autre que libre", () => {
  for (const status of ["encadree", "passeport", "challenge", "renouvellement"]) {
    const result = evaluateSessionMutation({
      existingSession: baseSession({ status: "libre" }),
      requestedSession: requestedSession({ status, participantIds: [] }),
      previousParticipantIds: [],
      actorParticipantId: "42",
      canReferer: true,
    });

    assert.equal(result.allowed, false, status);
    assert.equal(result.status, 403, status);
    assert.match(result.error, /seuls les encadrants/i, status);
  }
});

test("un encadrant peut passer une séance dans tous les statuts", () => {
  for (const status of ["fermee", "libre", "encadree", "passeport", "challenge", "renouvellement"]) {
    const result = evaluateSessionMutation({
      existingSession: baseSession({ status: status === "fermee" ? "libre" : "fermee" }),
      requestedSession: requestedSession({ status, participantIds: [] }),
      previousParticipantIds: [],
      actorParticipantId: "42",
      canEncadrer: true,
    });

    assert.equal(result.allowed, true, status);
    assert.equal(result.statusChanged, true, status);
  }
});

test("un administrateur sans qualification métier ne peut pas contourner la règle de statut", () => {
  const result = evaluateSessionMutation({
    existingSession: baseSession({ status: "libre" }),
    requestedSession: requestedSession({ status: "challenge", participantIds: [] }),
    previousParticipantIds: [],
    actorParticipantId: "42",
    isAdmin: true,
    canEncadrer: false,
    canReferer: false,
  });

  assert.equal(result.allowed, false);
  assert.equal(result.status, 403);
  assert.match(result.error, /seuls les encadrants/i);
});

test("un référent peut créer une séance libre sans obtenir les droits administrateur", () => {
  const result = evaluateSessionMutation({
    existingSession: null,
    requestedSession: requestedSession({
      status: "libre",
      participantIds: [],
    }),
    previousParticipantIds: [],
    actorParticipantId: "42",
    canReferer: true,
  });

  assert.equal(result.allowed, true);
  assert.equal(result.canCreate, true);
  assert.equal(result.canManageAll, false);
});

test("un référent ne peut pas inscrire un autre grimpeur lors de la création", () => {
  const result = evaluateSessionMutation({
    existingSession: null,
    requestedSession: requestedSession({
      status: "libre",
      participantIds: ["99"],
    }),
    previousParticipantIds: [],
    actorParticipantId: "42",
    canReferer: true,
  });

  assert.equal(result.allowed, false);
  assert.equal(result.status, 403);
  assert.match(result.error, /inscrire que lui-même/i);
});

test("un encadrant non administrateur ne peut pas affecter un autre encadrant lors de la création", () => {
  const result = evaluateSessionMutation({
    existingSession: null,
    requestedSession: requestedSession({
      status: "encadree",
      participantIds: [],
      encadrantId: "99",
    }),
    previousParticipantIds: [],
    actorParticipantId: "42",
    canEncadrer: true,
  });

  assert.equal(result.allowed, false);
  assert.equal(result.status, 403);
  assert.match(result.error, /uniquement s’affecter lui-même/i);
});

test("un encadrant peut s'affecter lui-même lors de la création", () => {
  const result = evaluateSessionMutation({
    existingSession: null,
    requestedSession: requestedSession({
      status: "encadree",
      participantIds: [],
      encadrantId: "42",
    }),
    previousParticipantIds: [],
    actorParticipantId: "42",
    canEncadrer: true,
  });

  assert.equal(result.allowed, true);
  assert.equal(result.encadrantChanged, true);
  assert.equal(result.canManageOwnEncadrant, true);
});

test("un encadrant peut s'affecter puis se retirer lui-même sur une séance existante", () => {
  const assignment = evaluateSessionMutation({
    existingSession: baseSession({ status: "encadree" }),
    requestedSession: requestedSession({
      status: "encadree",
      participantIds: [],
      encadrantId: "42",
    }),
    previousParticipantIds: [],
    actorParticipantId: "42",
    canEncadrer: true,
  });

  assert.equal(assignment.allowed, true);
  assert.equal(assignment.encadrantChanged, true);
  assert.equal(assignment.canManageOwnEncadrant, true);

  const removal = evaluateSessionMutation({
    existingSession: baseSession({ status: "encadree", encadrant_id: "42" }),
    requestedSession: requestedSession({
      status: "encadree",
      participantIds: [],
      encadrantId: null,
    }),
    previousParticipantIds: [],
    actorParticipantId: "42",
    canEncadrer: true,
  });

  assert.equal(removal.allowed, true);
  assert.equal(removal.encadrantChanged, true);
  assert.equal(removal.canManageOwnEncadrant, true);
});

test("un encadrant ne peut pas remplacer un autre encadrant", () => {
  const result = evaluateSessionMutation({
    existingSession: baseSession({ status: "encadree", encadrant_id: "99" }),
    requestedSession: requestedSession({
      status: "encadree",
      participantIds: [],
      encadrantId: "42",
    }),
    previousParticipantIds: [],
    actorParticipantId: "42",
    canEncadrer: true,
  });

  assert.equal(result.allowed, false);
  assert.equal(result.status, 403);
  assert.match(result.error, /uniquement s’affecter ou se retirer lui-même/i);
});

test("un encadrant peut créer une séance et s'inscrire lui-même si elle n'est pas fermée", () => {
  const result = evaluateSessionMutation({
    existingSession: null,
    requestedSession: requestedSession({
      status: "encadree",
      participantIds: ["42"],
    }),
    previousParticipantIds: [],
    actorParticipantId: "42",
    canEncadrer: true,
  });

  assert.equal(result.allowed, true);
  assert.equal(result.canManageAll, false);
  assert.equal(result.actorJoins, true);
});

test("la capacité compte les rôles sans les dupliquer", () => {
  const seventeenParticipants = Array.from({ length: 17 }, (_, index) => String(index + 1));

  assert.doesNotThrow(() => assertSessionCapacity(
    seventeenParticipants,
    { encadrant_id: "18", referent_id: "17" },
  ));

  assert.throws(
    () => assertSessionCapacity(
      seventeenParticipants,
      { encadrant_id: "18", referent_id: "19" },
    ),
    /18 participants/,
  );
});
