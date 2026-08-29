import { getPool } from "./database.js";
import { validateSessionPayload } from "../validation.js";
import { getDefaultSessionStatus } from "../session-default-status.js";

function normalizedId(value) {
  return value === null || value === undefined || value === "" ? null : String(value);
}

function sameId(left, right) {
  return normalizedId(left) === normalizedId(right);
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
 * - administrateur : gestion complète de la séance ;
 * - référent ou encadrant : peut changer le type/statut de la séance ;
 * - membre standard : peut uniquement s'inscrire ou se désinscrire lui-même ;
 * - une séance fermée refuse toute nouvelle inscription non administrateur ;
 * - création d'une séance : administrateur uniquement.
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
    return isAdmin
      ? { allowed: true, canManageAll: true, canChangeStatus: true }
      : { allowed: false, status: 403, error: "Seul un administrateur peut créer une séance." };
  }

  if (isAdmin) {
    return { allowed: true, canManageAll: true, canChangeStatus: true };
  }

  if (
    requestedSession.date !== existingSession.date
    || requestedSession.slot !== existingSession.slot
    || !sameId(requestedSession.encadrantId, existingSession.encadrant_id)
    || !sameId(requestedSession.referentId, existingSession.referent_id)
  ) {
    return {
      allowed: false,
      status: 403,
      error: "La date, le créneau, l’encadrant et le référent ne peuvent être modifiés que par un administrateur.",
    };
  }

  const requestedStatus = requestedSession.status || existingSession.status;
  const statusChanged = requestedStatus !== existingSession.status;
  const canChangeStatus = Boolean(canEncadrer || canReferer);
  if (statusChanged && !canChangeStatus) {
    return {
      allowed: false,
      status: 403,
      error: "Seuls les référents ou encadrants peuvent changer le type de séance.",
    };
  }

  if (!actorId) {
    return {
      allowed: false,
      status: 403,
      error: "Le compte doit être associé à un grimpeur pour modifier une inscription.",
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
    canChangeStatus,
    statusChanged,
    actorJoins,
    actorLeaves,
  };
}

async function loadActorPrivileges(client, participantId, isAdmin) {
  if (isAdmin) return { canEncadrer: true, canReferer: true };
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
      ? await client.query(`select participant_id from session_participants where session_id = $1`, [requested.id])
      : { rows: [] };
    const previousParticipantIds = participantsResult.rows.map((row) => String(row.participant_id));

    const privileges = await loadActorPrivileges(client, actorParticipantId, isAdmin);
    const policy = evaluateSessionMutation({
      existingSession: existing,
      requestedSession: requested,
      previousParticipantIds,
      actorParticipantId,
      isAdmin,
      ...privileges,
    });

    if (!policy.allowed) {
      await client.query("rollback");
      return res.status(policy.status || 403).json({ error: policy.error || "Action non autorisée" });
    }

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

      const nextParticipantIds = [...new Set(requested.participantIds.map(String))];
      const newlyAdded = nextParticipantIds.filter((id) => !previousParticipantIds.includes(id));
      if (resolvedStatus === "libre") {
        for (const participantId of newlyAdded) await assertLibreEligibility(client, participantId);
      }

      await client.query(`delete from session_participants where session_id = $1`, [requested.id]);
      for (const participantId of nextParticipantIds) {
        await client.query(
          `insert into session_participants (session_id, participant_id) values ($1,$2) on conflict do nothing`,
          [requested.id, participantId],
        );
      }
    } else {
      if (policy.statusChanged) {
        const result = await client.query(
          `update sessions set status = $2, updated_at = now() where id = $1 returning id, date, slot, status, encadrant_id, referent_id`,
          [requested.id, resolvedStatus],
        );
        sessionRow = result.rows[0];
      } else {
        sessionRow = existing;
      }

      const actorId = String(actorParticipantId);
      if (policy.actorJoins) {
        if (resolvedStatus === "libre") await assertLibreEligibility(client, actorId);
        await client.query(
          `insert into session_participants (session_id, participant_id) values ($1,$2) on conflict do nothing`,
          [requested.id, actorId],
        );
      } else if (policy.actorLeaves) {
        await client.query(
          `delete from session_participants where session_id = $1 and participant_id = $2`,
          [requested.id, actorId],
        );
      }
    }

    const finalParticipants = await client.query(
      `select participant_id from session_participants where session_id = $1 order by participant_id`,
      [requested.id],
    );

    await client.query("commit");
    return res.json({
      id: sessionRow.id,
      date: sessionRow.date,
      slot: sessionRow.slot,
      status: sessionRow.status,
      encadrantId: sessionRow.encadrant_id ? String(sessionRow.encadrant_id) : null,
      referentId: sessionRow.referent_id ? String(sessionRow.referent_id) : null,
      participantIds: finalParticipants.rows.map((row) => String(row.participant_id)),
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
