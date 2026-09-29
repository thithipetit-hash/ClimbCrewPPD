import { getPool } from "./database.js";
import { validateSessionPayload } from "../validation.js";
import { getDefaultSessionStatus } from "../../shared/session-default-status.js";
import { getSessionAttendanceIds, MAX_SESSION_PARTICIPANTS } from "../../shared/session-rules.js";

function normalizedId(value) {
  return value === null || value === undefined || value === "" ? null : String(value);
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
    date: session.date,
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
 * - administrateur : gestion complète de la séance hors changement de statut, qui reste soumis aux qualifications métier ;
 * - référent : peut uniquement passer une séance au statut libre ;
 * - encadrant : peut passer une séance à libre ou à tout autre statut et s'affecter/se retirer lui-même comme encadrant ;
 * - membre standard : peut uniquement s'inscrire ou se désinscrire lui-même ;
 * - une séance fermée refuse toute nouvelle inscription non administrateur ;
 * - création d'une séance : administrateur, ou référent/encadrant selon le statut demandé.
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

  if (!existingSession) {
    const requestedStatus = requestedSession.status || getDefaultSessionStatus(
      requestedSession.date,
      requestedSession.slot,
    );
    const canCreateRequestedStatus = requestedStatus === "libre"
      ? Boolean(canEncadrer || canReferer)
      : Boolean(canEncadrer);

    if (!isAdmin && !canCreateRequestedStatus) {
      return {
        allowed: false,
        status: 403,
        error: requestedStatus === "libre"
          ? "Seuls les référents, encadrants ou administrateurs peuvent créer une séance libre."
          : "Seuls les encadrants ou administrateurs peuvent créer une séance encadrée ou fermée.",
      };
    }

    if (isAdmin) {
      return {
        allowed: true,
        canCreate: true,
        canManageAll: true,
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

    const requestedEncadrantId = normalizedId(requestedSession.encadrantId);
    const requestedReferentId = normalizedId(requestedSession.referentId);
    const canAssignSelfAsEncadrant = Boolean(
      canEncadrer && requestedEncadrantId && requestedEncadrantId === actorId,
    );
    if (requestedReferentId || (requestedEncadrantId && !canAssignSelfAsEncadrant)) {
      return {
        allowed: false,
        status: 403,
        error: "Un encadrant peut uniquement s’affecter lui-même ; l’affectation des autres rôles reste réservée à un administrateur.",
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
      canChangeStatus: true,
      statusChanged: true,
      encadrantChanged: Boolean(requestedEncadrantId),
      canManageOwnEncadrant: canAssignSelfAsEncadrant,
      actorJoins,
      actorLeaves: false,
    };
  }

  const requestedStatus = requestedSession.status || existingSession.status;
  const statusChanged = requestedStatus !== existingSession.status;
  const canChangeRequestedStatus = requestedStatus === "libre"
    ? Boolean(canEncadrer || canReferer)
    : Boolean(canEncadrer);

  if (statusChanged && !canChangeRequestedStatus) {
    return {
      allowed: false,
      status: 403,
      error: requestedStatus === "libre"
        ? "Seuls les référents ou encadrants peuvent passer une séance au statut libre."
        : "Seuls les encadrants peuvent passer une séance dans un autre statut.",
    };
  }

  if (isAdmin) {
    return {
      allowed: true,
      canManageAll: true,
      canChangeStatus: canChangeRequestedStatus,
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
  const canManageOwnEncadrant = Boolean(
    encadrantChanged
    && canEncadrer
    && [existingEncadrantId, requestedEncadrantId].every(
      (encadrantId) => encadrantId === null || encadrantId === actorId,
    ),
  );
  const referentChanged = !sameId(requestedSession.referentId, existingSession.referent_id);

  if (
    requestedSession.date !== existingSession.date
    || requestedSession.slot !== existingSession.slot
    || referentChanged
    || (encadrantChanged && !canManageOwnEncadrant)
  ) {
    return {
      allowed: false,
      status: 403,
      error: "Un encadrant peut uniquement s’affecter ou se retirer lui-même ; les autres modifications de rôle restent réservées à un administrateur.",
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
    canChangeStatus: canChangeRequestedStatus,
    statusChanged,
    encadrantChanged,
    canManageOwnEncadrant,
    actorJoins,
    actorLeaves,
  };
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

    if (!isAdmin && targetParticipantId !== actorParticipantId) {
      return res.status(403).json({
        error: "Un utilisateur ne peut modifier que sa propre inscription à une séance.",
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
      const creationPolicy = evaluateSessionMutation({
        existingSession: null,
        requestedSession: {
          ...requestedSession,
          participantIds: [targetParticipantId],
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

      const resolvedStatus = requestedSession.status
        || getDefaultSessionStatus(requestedSession.date, requestedSession.slot);
      const createdSession = await client.query(
        `insert into sessions (id, date, slot, status, encadrant_id, referent_id)
         values ($1,$2,$3,$4,$5,$6)
         returning id, date, slot, status, encadrant_id, referent_id`,
        [
          requestedSession.id,
          requestedSession.date,
          requestedSession.slot,
          resolvedStatus,
          creationPolicy.canManageAll ? requestedSession.encadrantId || null : null,
          creationPolicy.canManageAll ? requestedSession.referentId || null : null,
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
    const preserveParticipants = Boolean(existing && req.body?.participantMode === "preserve");
    const policyRequestedSession = preserveParticipants
      ? { ...requested, participantIds: previousParticipantIds }
      : requested;

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

    const normalizedRequestedParticipantIds = assertSessionCapacity(
      policyRequestedSession.participantIds,
      policyRequestedSession,
    );

    const resolvedStatus = requested.status
      || existing?.status
      || getDefaultSessionStatus(requested.date, requested.slot);

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
          requested.encadrantId || null,
          requested.referentId || null,
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
           values ($1,$2,$3,$4,$5,null)
           returning id, date, slot, status, encadrant_id, referent_id`,
          [
            requested.id,
            requested.date,
            requested.slot,
            resolvedStatus,
            policy.canManageOwnEncadrant ? requested.encadrantId || null : null,
          ],
        );
        sessionRow = result.rows[0];
      } else if (policy.statusChanged || policy.encadrantChanged) {
        const result = await client.query(
          `update sessions
           set status = $2, encadrant_id = $3, updated_at = now()
           where id = $1
           returning id, date, slot, status, encadrant_id, referent_id`,
          [
            requested.id,
            resolvedStatus,
            policy.encadrantChanged ? requested.encadrantId || null : existing.encadrant_id,
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