import test from "node:test";
import assert from "node:assert/strict";
import { hasRequiredEnhancementPreload } from "../admin-users/config.js";
import { evaluateSessionMutation } from "../admin-users/session-authorization-service.js";
import { getAccessLogRetentionDays } from "../admin-users/access-log-retention.js";

const existingSession = {
  id: "2026-08-25-midi",
  date: "2026-08-25",
  slot: "midi",
  status: "encadree",
  encadrant_id: "10",
  referent_id: "11",
};

function requested(overrides = {}) {
  return {
    id: existingSession.id,
    date: existingSession.date,
    slot: existingSession.slot,
    status: existingSession.status,
    encadrantId: existingSession.encadrant_id,
    referentId: existingSession.referent_id,
    participantIds: ["20", "21"],
    ...overrides,
  };
}

test("la production refuse server.js sans préchargement sécurité", () => {
  assert.equal(hasRequiredEnhancementPreload({
    nodeEnv: "production",
    argv: ["node", "/app/server.js"],
    execArgv: [],
  }), false);

  assert.equal(hasRequiredEnhancementPreload({
    nodeEnv: "production",
    argv: ["node", "/app/server.js"],
    execArgv: ["--import", "./deployment-bootstrap.js"],
  }), true);
});

test("un membre standard ne peut changer que sa propre inscription", () => {
  const allowed = evaluateSessionMutation({
    existingSession,
    requestedSession: requested({ participantIds: ["20", "21", "22"] }),
    previousParticipantIds: ["20", "21"],
    actorParticipantId: "22",
  });
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.actorJoins, true);

  const rejected = evaluateSessionMutation({
    existingSession,
    requestedSession: requested({ participantIds: ["20", "22"] }),
    previousParticipantIds: ["20", "21"],
    actorParticipantId: "22",
  });
  assert.equal(rejected.allowed, false);
  assert.match(rejected.error, /propre inscription/);
});

test("seuls les référents et encadrants peuvent changer le type de séance", () => {
  const member = evaluateSessionMutation({
    existingSession,
    requestedSession: requested({ status: "libre" }),
    previousParticipantIds: ["20", "21"],
    actorParticipantId: "20",
  });
  assert.equal(member.allowed, false);
  assert.match(member.error, /encadrants ou référents/);

  const referent = evaluateSessionMutation({
    existingSession,
    requestedSession: requested({ status: "libre" }),
    previousParticipantIds: ["20", "21"],
    actorParticipantId: "20",
    canReferer: true,
  });
  assert.equal(referent.allowed, true);
  assert.equal(referent.statusChanged, true);

  const encadrant = evaluateSessionMutation({
    existingSession,
    requestedSession: requested({ status: "challenge" }),
    previousParticipantIds: ["20", "21"],
    actorParticipantId: "20",
    canEncadrer: true,
  });
  assert.equal(encadrant.allowed, true);

  const admin = evaluateSessionMutation({
    existingSession,
    requestedSession: requested({ date: "2026-08-26", participantIds: ["99"] }),
    previousParticipantIds: ["20", "21"],
    actorParticipantId: "20",
    isAdmin: true,
  });
  assert.equal(admin.allowed, true);
  assert.equal(admin.canManageAll, true);
});

test("un membre standard ne peut pas créer ou restructurer une séance, un gestionnaire oui", () => {
  const memberCreate = evaluateSessionMutation({
    existingSession: null,
    requestedSession: requested(),
    previousParticipantIds: [],
    actorParticipantId: "20",
  });
  assert.equal(memberCreate.allowed, false);

  const managerCreate = evaluateSessionMutation({
    existingSession: null,
    requestedSession: requested({ participantIds: [] }),
    previousParticipantIds: [],
    actorParticipantId: "20",
    canReferer: true,
  });
  assert.equal(managerCreate.allowed, true);

  const memberStructural = evaluateSessionMutation({
    existingSession,
    requestedSession: requested({ encadrantId: "999" }),
    previousParticipantIds: ["20", "21"],
    actorParticipantId: "20",
  });
  assert.equal(memberStructural.allowed, false);

  const managerStructural = evaluateSessionMutation({
    existingSession,
    requestedSession: requested({ encadrantId: "999" }),
    previousParticipantIds: ["20", "21"],
    actorParticipantId: "20",
    canReferer: true,
  });
  assert.equal(managerStructural.allowed, true);
  assert.equal(managerStructural.canManageRoles, true);
});

test("la rétention des logs vaut 90 jours par défaut et reste bornée", () => {
  assert.equal(getAccessLogRetentionDays(undefined), 90);
  assert.equal(getAccessLogRetentionDays("120"), 120);
  assert.equal(getAccessLogRetentionDays("1"), 90);
  assert.equal(getAccessLogRetentionDays("5000"), 90);
});
