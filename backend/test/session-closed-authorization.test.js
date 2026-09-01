import test from "node:test";
import assert from "node:assert/strict";
import { evaluateSessionMutation } from "../admin-users/session-authorization-service.js";

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