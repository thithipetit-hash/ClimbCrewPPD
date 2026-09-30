import { getPool } from "./database.js";
import { validateSessionPayload } from "../validation.js";
import { getDefaultSessionStatus } from "../../shared/session-default-status.js";
import { getSessionAttendanceIds, getSessionSupervisorRole, isSessionManager, normalizeSessionRoles, MAX_SESSION_PARTICIPANTS } from "../../shared/session-rules.js";

function normalizedId(value) {
  return value === null || value === undefined || value === "" ? null : String(value);
}

function normalizedSessionDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").slice(0, 10);
}

function sameId(left, right) {
  return normalizedId(left) === normalizedId(right);
}

export function assertSessionCapacity(participantIds, session = null) {
  const uniqueParticipantIds = [...new Set((participantIds || [])
    .filter((value) => value !== null && value !== undefined && value !== "")
    .map(String))];
  const attendanceIds = session
    ? getSessionAttendanceIds({ ...session, participantIds: uniqueParticipantIds })
    : uniqueParticipantIds;
  if (attendanceIds.length > MAX_SESSION_PARTICIPANTS) {
    const error = new Error(`Une séance ne peut pas dépasser ${MAX_SESSION_PARTICIPANTS} participants.`);
    error.status = 409;
    throw error;
  }
  return uniqueParticipantIds;
}


function sessionAuditSnapshot(session, participantIds = []) {
  if (!session) return null;
  return {
    id: String(session.id),
    date: normalizedSessionDate(session.date),
    slot: session.slot,
    status: session.status,
    encadrantId: normalizedId(session.encadrant_id ?? session.encadrantId),
    referentId: normalizedId(session.referent_id ?? session.referentId),
    participantIds: [...new Set((participantIds || []).filter(Boolean).map(String))].sort(),
  };
}

function sessionAuditChanges(before, after) {
  if (!before) return ["creation"];
  const changes = [];
  if (before.date !== after.date) changes.push("date");
  if (before.slot !== after.slot) changes.push("creneau");
  if (before.status !== after.status) changes.push("statut");
  if (before.encadrantId !== after.encadrantId) changes.push("encadrant");
  if (before.referentId !== after.referentId) changes.push("referent");
  if (JSON.stringify(before.participantIds) !== JSON.stringify(after.participantIds)) changes.push("participants");
  return changes;
}

async function writePlanningAuditLog(client, req, eventType, details) {
  await client.query(
    `insert into access_logs (user_id, event_type, success, ip_address, user_agent, details)
     values ($1,$2,true,$3,$4,$5::jsonb)`,
    [
      req.auth?.user?.id || null,
      eventType,
      req.ip || null,
      req.headers?.["user-agent"] || null,
      JSON.stringify(details || {}),
    ],
  );
}

function symmetricDifference(left, right) {
  const changed = [];
  for (const value of left) if (!right.has(value)) changed.push(value);
  for (const value of right) if (!left.has(value)) changed.push(value);
  return changed;
}

/**
 * Politique d'autorisation indépendante de PostgreSQL, afin d'être testable.
 *
 * - encadrant ou référent : peut changer le type de séance et sélectionner un responsable qualifié ;
 * - séance libre : le responsable sélectionné doit être référent ;
 * - séance encadrée : le responsable sélectionné doit être encadrant ;
 * - administrateur : peut gérer les données de séance, mais un changement de type reste réservé à un encadrant/référent ;
 * - membre standard : peut uniquement s'inscrire ou se désinscrire lui-même ;
 * - une séance fermée refuse toute nouvelle inscription non administrateur.
 */
export function evaluateSessionMutation({
  existingSession,
  requestedSession,
  previousParticipantIds = [],
  actorParticipantId,
  isAdmin = false,
  canEncadrer = false,
  canReferer = false,
}) {
  const previous = new Set(previousParticipantIds.map(String));
  const requested = new Set((requestedSession.participantIds || []).map(String));
  const actorId = normalizedId(actorParticipantId);
  const canManageSession = isSessionManager({ canEncadrer, canReferer });

  if (!existingSession) {
    const requestedStatus = requestedSession.status || getDefaultSessionStatus(
      requestedSession.date,
      requestedSession.slot,
    );

    if (!isAdmin && !canManageSession) {
      return {
        allowed: false,
        status: 403,
        error: "Seuls les encadrants ou référents peuvent créer et paramétrer une séance.",
      };
    }

    if (isAdmin) {
      return {
        allowed: true,
        canCreate: true,
        canManageAll: true,
        canManageRoles: true,
        canChangeStatus: true,
        statusChanged: true,
      };
    }

    if (!actorId) {
      return {
        allowed: false,
        status: 403,
        error: "Le compte doit être associé à un grimpeur pour créer une séance.",
      };
    }

    if ([...requested].some((participantId) => participantId !== actorId)) {
      return {
        allowed: false,
        status: 403,
        error: "Un utilisateur ne peut inscrire que lui-même lors de la création d’une séance.",
      };
    }

    const actorJoins = requested.has(actorId);
    if (actorJoins && requestedStatus === "fermee") {
      return {
        allowed: false,
        status: 409,
        error: "Cette séance est fermée : aucune nouvelle inscription n’est autorisée.",
      };
    }

    return {
      allowed: true,
      canCreate: true,
      canManageAll: false,
      canManageRoles: true,
      canChangeStatus: true,
      statusChanged: true,
      encadrantChanged: Boolean(normalizedId(requestedSession.encadrantId)),
      referentChanged: Boolean(normalizedId(requestedSession.referentId)),
      actorJoins,
      actorLeaves: false,
    };
  }

  const requestedStatus = requestedSession.status || existingSession.status;
  const statusChanged = requestedStatus !== existingSession.status;

  if (statusChanged && !canManageSession) {
    return {
      allowed: false,
      status: 403,
      error: "Seuls les encadrants ou référents peuvent changer le type d’une séance.",
    };
  }

  if (isAdmin) {
    return {
      allowed: true,
      canManageAll: true,
      canManageRoles: true,
      canChangeStatus: canManageSession,
      statusChanged,
    };
  }

  if (!actorId) {
    return {
      allowed: false,
      status: 403,
      error: "Le compte doit être associé à un grimpeur pour modifier une inscription.",
    };
  }

  const existingEncadrantId = normalizedId(existingSession.encadrant_id ?? existingSession.encadrantId);
  const requestedEncadrantId = normalizedId(requestedSession.encadrantId);
  const encadrantChanged = existingEncadrantId !== requestedEncadrantId;
  const existingReferentId = normalizedId(existingSession.referent_id ?? existingSession.referentId);
  const requestedReferentId = normalizedId(requestedSession.referentId);
  const referentChanged = existingReferentId !== requestedReferentId;

  if (
    normalizedSessionDate(requestedSession.date) !== normalizedSessionDate(existingSession.date)
    || requestedSession.slot !== existingSession.slot
  ) {
    return {
      allowed: false,
      status: 403,
      error: "La date et le créneau d’une séance ne peuvent pas être modifiés depuis le planning.",
    };
  }

  if ((encadrantChanged || referentChanged) && !canManageSession) {
    return {
      allowed: false,
      status: 403,
      error: "Seuls les encadrants ou référents peuvent modifier le rôle de séance.",
    };
  }

  const participantChanges = symmetricDifference(previous, requested);
  if (participantChanges.some((participantId) => participantId !== actorId)) {
    return {
      allowed: false,
      status: 403,
      error: "Un utilisateur ne peut modifier que sa propre inscription à une séance.",
    };
  }

  const actorJoins = requested.has(actorId) && !previous.has(actorId);
  const actorLeaves = previous.has(actorId) && !requested.has(actorId);
  if (actorJoins && requestedStatus === "fermee") {
    return {
      allowed: false,
      status: 409,
      error: "Cette séance est fermée : aucune nouvelle inscription n’est autorisée.",
    };
  }

  return {
    allowed: true,
    canManageAll: false,
    canManageRoles: canManageSession,
    canChangeStatus: canManageSession,
    statusChanged,
    encadrantChanged,
    referentChanged,
    actorJoins,
    actorLeaves,
  };
}

async function assertSessionSupervisorEligibility(client, session) {
  const role = getSessionSupervisorRole(session?.status);
  const participantId = role === "encadrant"
    ? normalizedId(session?.encadrantId)
    : role === "referent"
      ? normalizedId(session?.referentId)
      : null;

  if (!participantId) return;

  const column = role === "encadrant" ? "can_encadrer" : "can_referer";
  const result = await client.query(
    `select id from participants where id = $1 and ${column} = true limit 1`,
    [participantId],
  );
  if (!result.rowCount) {
    const label = role === "encadrant" ? "encadrant" : "référent";
    const error = new Error(`Le grimpeur sélectionné n’est pas habilité comme ${label}.`);
    error.status = 400;
    throw error;
  }
}

async function loadActorPrivileges(client, participantId) {
  const id = Number(participantId);
  if (!Number.isInteger(id) || id <= 0) return { canEncadrer: false, canReferer: false };

  const result = await client.query(
    `select can_encadrer, can_referer from participants where id = $1 limit 1`,
    [id],
  );
  return {
    canEncadrer: Boolean(result.rows[0]?.can_encadrer),
    canReferer: Boolean(result.rows[0]?.can_referer),
  };
}

async function assertLibreEligibility(client, participantId) {
  const result = await client.query(
    `select id from participants where id = $1 and lower(passport) in ('jaune', 'orange', 'vert', 'bleu')`,
    [participantId],
  );
  if (!result.rowCount) {
    const error = new Error(
      "Une séance libre est réservée aux passeports Jaune, Orange, Vert ou Bleu pour toute nouvelle inscription.",
    );
    error.status = 400;
    throw error;
  }
}

export async function registerParticipantForSession(client, {
  sessionId,
  participantId,
  session = null,
  participantIds = null,
  allowClosed = false,
} = {}) {
  const actorId = normalizedId(participantId);
  if (!actorId) {
    const error = new Error("Le compte doit être associé à un grimpeur pour s’inscrire.");
    error.status = 403;
    throw error;
  }

  const resolvedSession = session || (await client.query(
    `select id, status, encadrant_id, referent_id from sessions where id = $1 for update`,
    [sessionId],
  )).rows[0];
  if (!resolvedSession) {
    const error = new Error("Séance introuvable.");
    error.status = 404;
    throw error;
  }

  const listedParticipants = participantIds === null
    ? (await client.query(
      `select participant_id from session_participants where session_id = $1`,
      [resolvedSession.id],
    )).rows.map((row) => String(row.participant_id))
    : participantIds.map(String);

  const registeredParticipantIds = [...new Set(listedParticipants.map(String))];
  const attendanceIds = getSessionAttendanceIds({
    ...resolvedSession,
    participantIds: registeredParticipantIds,
  });

  if (attendanceIds.includes(actorId)) {
    return { registered: false, session: resolvedSession };
  }
  if (resolvedSession.status === "fermee" && !allowClosed) {
    const error = new Error("Cette séance est fermée : aucune nouvelle inscription n’est autorisée.");
    error.status = 409;
    throw error;
  }

  assertSessionCapacity([...registeredParticipantIds, actorId], resolvedSession);
  if (resolvedSession.status === "libre") {
    await assertLibreEligibility(client, actorId);
  }

  const registration = await client.query(
    `insert into session_participants (session_id, participant_id, created_at)
     values ($1, $2, clock_timestamp())
     on conflict (session_id, participant_id) do nothing
     returning session_id`,
    [resolvedSession.id, actorId],
  );
  return { registered: registration.rowCount > 0, session: resolvedSession };
}

function validateRegistrationParticipantId(value) {
  const participantId = normalizedId(value);
  if (!participantId || !/^\d+$/.test(participantId)) {
    const error = new Error("Identifiant de grimpeur invalide.");
    error.status = 400;
    throw error;
  }
  return participantId;
}

async function mutateSessionParticipant(req, res, { remove = false } = {}) {
  const client = await getPool().connect();
  try {
    const targetParticipantId = validateRegistrationParticipantId(req.params.participantId);
    const actorParticipantId = normalizedId(req.auth?.user?.participantId);
    const isAdmin = req.auth?.user?.role === "admin";

    if (!isAdmin && !actorParticipantId) {
      return res.status(403).json({
        error: "Le compte doit être associé à un grimpeur pour modifier les inscriptions.",
      });
    }

    if (remove && !isAdmin && targetParticipantId !== actorParticipantId) {
      return res.status(403).json({
        error: "Un utilisateur ne peut retirer que sa propre inscription à une séance.",
      });
    }

    await client.query("begin");
    const sessionResult = await client.query(
      `select id, date, slot, status, encadrant_id, referent_id
       from sessions where id = $1 for update`,
      [req.params.id],
    );
    let session = sessionResult.rows[0] || null;
    let created = false;

    if (!session) {
      if (remove) {
        await client.query("rollback");
        return res.status(404).json({ error: "Séance introuvable." });
      }

      const requestedSession = validateSessionPayload(req.body?.session || {}, req.params.id);
      const privileges = await loadActorPrivileges(client, actorParticipantId);
      const canManageSession = isSessionManager(privileges);
      const defaultStatus = getDefaultSessionStatus(requestedSession.date, requestedSession.slot);
      const resolvedStatus = requestedSession.status || defaultStatus;
      const roleSelection = normalizeSessionRoles({
        ...requestedSession,
        status: resolvedStatus,
      });

      let canConfigureSession = isAdmin || canManageSession;
      if (!canConfigureSession) {
        const requestsNonDefaultStatus = resolvedStatus !== defaultStatus;
        const requestsSupervisor = Boolean(roleSelection.encadrantId || roleSelection.referentId);
        if (requestsNonDefaultStatus || requestsSupervisor) {
          await client.query("rollback");
          return res.status(403).json({
            error: "Seuls les encadrants ou référents peuvent changer le type ou le responsable d’une séance.",
          });
        }
      } else {
        const creationPolicy = evaluateSessionMutation({
          existingSession: null,
          requestedSession: {
            ...requestedSession,
            participantIds: [],
          },
          previousParticipantIds: [],
          actorParticipantId,
          isAdmin,
          ...privileges,
        });
        if (!creationPolicy.allowed) {
          await client.query("rollback");
          return res.status(creationPolicy.status || 403).json({
            error: creationPolicy.error || "Création de la séance non autorisée",
          });
        }
      }

      if (canConfigureSession) {
        await assertSessionSupervisorEligibility(client, roleSelection);
      }
      const createdSession = await client.query(
        `insert into sessions (id, date, slot, status, encadrant_id, referent_id)
         values ($1,$2,$3,$4,$5,$6)
         returning id, date, slot, status, encadrant_id, referent_id`,
        [
          requestedSession.id,
          requestedSession.date,
          requestedSession.slot,
          canConfigureSession ? resolvedStatus : defaultStatus,
          canConfigureSession ? roleSelection.encadrantId : null,
          canConfigureSession ? roleSelection.referentId : null,
        ],
      );
      session = createdSession.rows[0];
      created = true;
    }

    const participantResult = await client.query(
      "select id from participants where id = $1 limit 1",
      [targetParticipantId],
    );
    if (!participantResult.rowCount) {
      await client.query("rollback");
      return res.status(404).json({ error: "Grimpeur introuvable." });
    }

    const beforeResult = await client.query(
      `select participant_id
       from session_participants
       where session_id = $1
       order by created_at asc, participant_id asc`,
      [session.id],
    );
    const beforeParticipantIds = beforeResult.rows.map((row) => String(row.participant_id));

    let changed = false;
    if (remove) {
      const deletion = await client.query(
        `delete from session_participants
         where session_id = $1 and participant_id = $2
         returning participant_id`,
        [session.id, targetParticipantId],
      );
      changed = deletion.rowCount > 0;
    } else {
      const registration = await registerParticipantForSession(client, {
        sessionId: session.id,
        participantId: targetParticipantId,
        session,
        participantIds: beforeParticipantIds,
        allowClosed: isAdmin,
      });
      changed = registration.registered;
    }

    const afterResult = await client.query(
      `select participant_id
       from session_participants
       where session_id = $1
       order by created_at asc, participant_id asc`,
      [session.id],
    );
    const participantIds = afterResult.rows.map((row) => String(row.participant_id));

    if (changed || created) {
      await writePlanningAuditLog(
        client,
        req,
        created ? "planning_session_created" : "planning_session_updated",
        {
          sessionId: String(session.id),
          changes: created ? ["creation"] : ["participants"],
          before: created ? null : sessionAuditSnapshot(session, beforeParticipantIds),
          after: sessionAuditSnapshot(session, participantIds),
        },
      );
    }

    await client.query("commit");
    return res.json({
      ok: true,
      changed,
      participantIds,
    });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    return res.status(error.status || 500).json({
      error: error.message || "Modification de l’inscription impossible",
      fields: error.fields || undefined,
    });
  } finally {
    client.release();
  }
}

export function addSessionParticipantWithAuthorization(req, res) {
  return mutateSessionParticipant(req, res);
}

export function removeSessionParticipantWithAuthorization(req, res) {
  return mutateSessionParticipant(req, res, { remove: true });
}

/** Contrôleur sécurisé remplaçant PUT /sessions/:id. */
export async function updateSessionWithAuthorization(req, res) {
  const client = await getPool().connect();
  try {
    const requested = validateSessionPayload(req.body || {}, req.params.id);
    const isAdmin = req.auth?.user?.role === "admin";
    const actorParticipantId = req.auth?.user?.participantId || null;

    await client.query("begin");

    const existingResult = await client.query(
      `select id, date, slot, status, encadrant_id, referent_id from sessions where id = $1 for update`,
      [requested.id],
    );
    const existing = existingResult.rows[0] || null;

    const participantsResult = existing
      ? await client.query(
        `select participant_id
         from session_participants
         where session_id = $1
         order by created_at asc, participant_id asc`,
        [requested.id],
      )
      : { rows: [] };
    const previousParticipantIds = [...new Set(
      participantsResult.rows.map((row) => String(row.participant_id)),
    )];

    const privileges = await loadActorPrivileges(client, actorParticipantId);
    const resolvedStatus = requested.status
      || existing?.status
      || getDefaultSessionStatus(requested.date, requested.slot);
    const canonicalRequestedSession = normalizeSessionRoles({
      ...requested,
      status: resolvedStatus,
    });
    const preserveParticipants = Boolean(existing && req.body?.participantMode === "preserve");
    const policyRequestedSession = preserveParticipants
      ? { ...canonicalRequestedSession, participantIds: previousParticipantIds }
      : canonicalRequestedSession;

    if (existing && isAdmin && !preserveParticipants) {
      const participantChanges = symmetricDifference(
        new Set(previousParticipantIds),
        new Set(requested.participantIds.map(String)),
      );
      if (participantChanges.length > 0) {
        await client.query("rollback");
        return res.status(409).json({
          error: "Les inscriptions doivent être modifiées avec les opérations dédiées du planning.",
        });
      }
    }

    const policy = evaluateSessionMutation({
      existingSession: existing,
      requestedSession: policyRequestedSession,
      previousParticipantIds,
      actorParticipantId,
      isAdmin,
      ...privileges,
    });

    if (!policy.allowed) {
      await client.query("rollback");
      return res.status(policy.status || 403).json({ error: policy.error || "Action non autorisée" });
    }

    await assertSessionSupervisorEligibility(client, policyRequestedSession);
    const normalizedRequestedParticipantIds = assertSessionCapacity(
      policyRequestedSession.participantIds,
      policyRequestedSession,
    );

    let sessionRow;
    if (policy.canManageAll) {
      const result = await client.query(
        `
          insert into sessions (id, date, slot, status, encadrant_id, referent_id)
          values ($1,$2,$3,$4,$5,$6)
          on conflict (id) do update set
            date = excluded.date,
            slot = excluded.slot,
            status = excluded.status,
            encadrant_id = excluded.encadrant_id,
            referent_id = excluded.referent_id,
            updated_at = now()
          returning id, date, slot, status, encadrant_id, referent_id
        `,
        [
          requested.id,
          requested.date,
          requested.slot,
          resolvedStatus,
          policyRequestedSession.encadrantId,
          policyRequestedSession.referentId,
        ],
      );
      sessionRow = result.rows[0];

      if (!existing) {
        const nextParticipantIds = normalizedRequestedParticipantIds;
        const previousParticipantSet = new Set(previousParticipantIds);
        const nextParticipantSet = new Set(nextParticipantIds);
        const newlyAdded = nextParticipantIds.filter((id) => !previousParticipantSet.has(id));
        const removedParticipantIds = previousParticipantIds.filter((id) => !nextParticipantSet.has(id));
        if (resolvedStatus === "libre") {
          for (const participantId of newlyAdded) await assertLibreEligibility(client, participantId);
        }
  
        for (const participantId of removedParticipantIds) {
          await client.query(
            `delete from session_participants where session_id = $1 and participant_id = $2`,
            [requested.id, participantId],
          );
        }
        for (const participantId of newlyAdded) {
          await client.query(
            `insert into session_participants (session_id, participant_id, created_at)
             values ($1,$2,clock_timestamp())
             on conflict do nothing`,
            [requested.id, participantId],
          );
        }
      }
    } else {
      if (!existing) {
        const result = await client.query(
          `insert into sessions (id, date, slot, status, encadrant_id, referent_id)
           values ($1,$2,$3,$4,$5,$6)
           returning id, date, slot, status, encadrant_id, referent_id`,
          [
            requested.id,
            requested.date,
            requested.slot,
            resolvedStatus,
            policy.canManageRoles ? policyRequestedSession.encadrantId : null,
            policy.canManageRoles ? policyRequestedSession.referentId : null,
          ],
        );
        sessionRow = result.rows[0];
      } else if (policy.statusChanged || policy.encadrantChanged || policy.referentChanged) {
        const result = await client.query(
          `update sessions
           set status = $2, encadrant_id = $3, referent_id = $4, updated_at = now()
           where id = $1
           returning id, date, slot, status, encadrant_id, referent_id`,
          [
            requested.id,
            resolvedStatus,
            policy.encadrantChanged ? policyRequestedSession.encadrantId : existing.encadrant_id,
            policy.referentChanged ? policyRequestedSession.referentId : existing.referent_id,
          ],
        );
        sessionRow = result.rows[0];
      } else {
        sessionRow = existing;
      }

      const actorId = String(actorParticipantId);
      if (policy.actorJoins) {
        await registerParticipantForSession(client, {
          sessionId: requested.id,
          participantId: actorId,
          session: sessionRow,
          participantIds: previousParticipantIds,
        });
      } else if (policy.actorLeaves) {
        await client.query(
          `delete from session_participants where session_id = $1 and participant_id = $2`,
          [requested.id, actorId],
        );
      }
    }

    const finalParticipants = await client.query(
      `select participant_id
       from session_participants
       where session_id = $1
       order by created_at asc, participant_id asc`,
      [requested.id],
    );
    const finalParticipantIds = [...new Set(
      finalParticipants.rows.map((row) => String(row.participant_id)),
    )];
    const beforeAudit = sessionAuditSnapshot(existing, previousParticipantIds);
    const afterAudit = sessionAuditSnapshot(sessionRow, finalParticipantIds);
    const changes = sessionAuditChanges(beforeAudit, afterAudit);
    if (changes.length > 0) {
      await writePlanningAuditLog(
        client,
        req,
        existing ? "planning_session_updated" : "planning_session_created",
        {
          sessionId: String(requested.id),
          changes,
          before: beforeAudit,
          after: afterAudit,
        },
      );
    }

    await client.query("commit");
    return res.json({
      id: sessionRow.id,
      date: sessionRow.date,
      slot: sessionRow.slot,
      status: sessionRow.status,
      encadrantId: sessionRow.encadrant_id ? String(sessionRow.encadrant_id) : null,
      referentId: sessionRow.referent_id ? String(sessionRow.referent_id) : null,
      participantIds: finalParticipantIds,
    });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    return res.status(error.status || 500).json({
      error: error.message || "Mise à jour de la séance impossible",
      fields: error.fields || undefined,
    });
  } finally {
    client.release();
  }
}