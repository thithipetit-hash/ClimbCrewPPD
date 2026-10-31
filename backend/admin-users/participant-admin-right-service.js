import { getPool } from "./database.js";
import { writeAccessLog } from "./access-log-service.js";
import { cleanEmail } from "./security.js";
import { serializeParticipant } from "./participant-privacy-service.js";
import { serializeUser } from "./user-serializer.js";
import { validateParticipantPayload, ValidationError } from "../validation.js";
import { sendApprovalNotificationEmail } from "./account-service.js";

function cleanChoice(value, fallback) {
  const normalized = String(value || fallback).trim().toLowerCase();
  return /^[a-z0-9_]{2,40}$/.test(normalized) ? normalized : fallback;
}

function actorEmail(req) {
  return req.auth?.user?.email || req.enhancementAuth?.user?.email || null;
}

function isActiveAdmin(user) {
  return Boolean(
    user
    && user.status === "active"
    && (user.role === "admin" || user.is_admin === true),
  );
}

async function ensureAnotherActiveAdmin(client, userId) {
  const result = await client.query(
    `
      select count(*)::int as count
      from users
      where id <> $1
        and status = 'active'
        and (role = 'admin' or is_admin = true)
    `,
    [userId],
  );
  return Number(result.rows[0]?.count || 0) > 0;
}

async function updateUserAdminState(client, user, canAdmin) {
  if (!user) return null;

  if (!canAdmin && isActiveAdmin(user)) {
    const hasAnother = await ensureAnotherActiveAdmin(client, user.id);
    if (!hasAnother) {
      const error = new Error("Le dernier compte administrateur actif ne peut pas perdre ce droit.");
      error.status = 409;
      throw error;
    }
  }

  const result = await client.query(
    `
      update users
      set role = case when $2 then 'admin' else 'user' end,
          is_admin = $2,
          receive_account_notifications = case
            when $2 then receive_account_notifications
            else false
          end
      where id = $1
      returning *
    `,
    [user.id, canAdmin],
  );
  return result.rows[0] || null;
}

/**
 * Met à jour une fiche participant et, dans la même transaction, le droit réel
 * du compte lié. `participants.can_admin` devient ainsi le choix fonctionnel
 * affiché dans Gestion des participants et `users.role/is_admin` son application
 * effective pour le contrôle d'accès.
 */
export async function updateParticipantWithAdminRight(req, res) {
  const participantId = Number(req.params?.id);
  if (!Number.isInteger(participantId) || participantId <= 0) {
    return res.status(400).json({ error: "Identifiant du grimpeur invalide" });
  }

  let participant;
  try {
    participant = validateParticipantPayload(req.body || {});
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message, fields: error.fields });
    }
    throw error;
  }

  const avatarId = cleanChoice(participant.avatarId, "gecko");
  const crestId = cleanChoice(participant.crestId, "cristal");
  const profilePublic = participant.profilePublic !== false;
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");
    const currentResult = await client.query(
      `select id, can_admin from participants where id = $1 for update`,
      [participantId],
    );
    if (!currentResult.rowCount) {
      await client.query("rollback");
      return res.status(404).json({ error: "Participant introuvable" });
    }

    const linkedResult = await client.query(
      `select * from users where participant_id = $1 order by id asc for update`,
      [participantId],
    );
    if (linkedResult.rowCount > 1) {
      await client.query("rollback");
      return res.status(409).json({
        error: "Plusieurs comptes sont associés à ce participant. Corrigez d’abord les associations.",
      });
    }

    const linkedUser = linkedResult.rows[0] || null;
    let updatedUser = null;
    if (linkedUser && Boolean(currentResult.rows[0].can_admin) !== Boolean(participant.canAdmin)) {
      updatedUser = await updateUserAdminState(client, linkedUser, Boolean(participant.canAdmin));
    }

    const updatedParticipantResult = await client.query(
      `
        update participants
        set nom = $2,
            prenom = $3,
            email = $4,
            login_email = case when $4 = '' then login_email else $4 end,
            passport = $5,
            passport_decouverte = $6,
            passeport_ffme = $7,
            sexe = $8,
            cotisation = $9,
            ffme = $10,
            can_encadrer = $11,
            can_referer = $12,
            can_admin = $13,
            avatar_id = $14,
            crest_id = $15,
            profile_public = $16,
            annee_naissance = $17
        where id = $1
        returning id, nom, prenom, email, login_email, passport, passport_decouverte, passeport_ffme, sexe, cotisation, ffme,
                  initiateur_sae, initiateur_sne, can_encadrer, can_referer, can_admin,
                  avatar_id, crest_id, profile_public, custom_avatar_image, annee_naissance
      `,
      [
        participantId,
        participant.nom,
        participant.prenom,
        cleanEmail(participant.email),
        participant.passport,
        participant.passportDecouverte,
        participant.passeportFfme,
        participant.sexe,
        participant.cotisation,
        participant.ffme,
        participant.canEncadrer,
        participant.canReferer,
        participant.canAdmin,
        avatarId,
        crestId,
        profilePublic,
        participant.anneeNaissance,
      ],
    );

    await client.query("commit");

    if (updatedUser) {
      await writeAccessLog({
        userId: req.auth?.user?.id || req.enhancementAuth?.user?.id || null,
        eventType: "administrator_right_changed_from_participant",
        success: true,
        req,
        details: {
          targetUserId: String(updatedUser.id),
          participantId: String(participantId),
          isAdmin: Boolean(participant.canAdmin),
          changedBy: actorEmail(req),
        },
      });
    }

    return res.json(serializeParticipant(updatedParticipantResult.rows[0]));
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    return res.status(error.status || 500).json({
      error: error.status ? error.message : "Mise à jour du participant impossible",
    });
  } finally {
    client.release();
  }
}

/**
 * Association manuelle d'un compte : le droit administrateur est repris depuis
 * la fiche cible, et non l'inverse. Cela évite qu'un rattachement efface une case
 * Administrateur déjà définie dans la gestion des participants.
 */
export async function setUserParticipantAssociationWithAdminRight(req, res) {
  const userId = Number(req.params?.id);
  const rawParticipantId = req.body?.participantId;
  const participantId = rawParticipantId === null || rawParticipantId === undefined || rawParticipantId === ""
    ? null
    : Number(rawParticipantId);

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: "Identifiant du compte invalide" });
  }
  if (participantId !== null && (!Number.isInteger(participantId) || participantId <= 0)) {
    return res.status(400).json({ error: "Identifiant du grimpeur invalide" });
  }

  const client = await getPool().connect();
  try {
    await client.query("begin");
    const userResult = await client.query(`select * from users where id = $1 for update`, [userId]);
    const user = userResult.rows[0];
    if (!user) {
      await client.query("rollback");
      return res.status(404).json({ error: "Compte introuvable" });
    }

    if (participantId !== null && user.status === "pending" && !user.email_verified_at) {
      await client.query("rollback");
      return res.status(409).json({
        error: "L’adresse e-mail doit être confirmée avant d’associer ce compte à une fiche grimpeur.",
      });
    }

    let targetParticipant = null;
    if (participantId !== null) {
      const participantResult = await client.query(
        `select id, can_admin from participants where id = $1 for update`,
        [participantId],
      );
      targetParticipant = participantResult.rows[0] || null;
      if (!targetParticipant) {
        await client.query("rollback");
        return res.status(404).json({ error: "Fiche grimpeur introuvable" });
      }

      const conflict = await client.query(
        `select id from users where participant_id = $1 and id <> $2 limit 1`,
        [participantId, userId],
      );
      if (conflict.rowCount) {
        await client.query("rollback");
        return res.status(409).json({ error: "Cette fiche grimpeur est déjà associée à un autre compte" });
      }
    }

    const desiredAdmin = Boolean(targetParticipant?.can_admin);
    if (participantId === null && isActiveAdmin(user)) {
      const hasAnother = await ensureAnotherActiveAdmin(client, userId);
      if (!hasAnother) {
        await client.query("rollback");
        return res.status(409).json({
          error: "Le dernier administrateur actif ne peut pas être dissocié de sa fiche.",
        });
      }
    }

    const roleAdjustedUser = participantId !== null
      ? await updateUserAdminState(client, user, desiredAdmin)
      : user;

    const updatedResult = await client.query(
      `update users set participant_id = $2 where id = $1 returning *`,
      [userId, participantId],
    );
    let updatedUser = updatedResult.rows[0];

    if (participantId !== null) {
      await client.query(
        `update participants set login_email = $2, email = $2 where id = $1`,
        [participantId, cleanEmail(user.email)],
      );
      updatedUser = { ...updatedUser, role: roleAdjustedUser.role, is_admin: roleAdjustedUser.is_admin };
    }

    await client.query("commit");
    await writeAccessLog({
      userId: req.auth?.user?.id || req.enhancementAuth?.user?.id || null,
      eventType: participantId ? "account_participant_associated" : "account_participant_dissociated",
      success: true,
      req,
      details: {
        targetUserId: String(userId),
        participantId: participantId ? String(participantId) : null,
        appliedAdminRight: participantId !== null ? desiredAdmin : null,
        changedBy: actorEmail(req),
      },
    });

    return res.json({ ok: true, user: serializeUser(updatedUser) });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    return res.status(error.status || 500).json({
      error: error.status ? error.message : "Association du compte impossible",
    });
  } finally {
    client.release();
  }
}

/** Approuve le compte en appliquant le droit Administrateur de la fiche liée. */
export async function approveVerifiedAccountWithParticipantRole(req, res) {
  const userId = Number(req.params?.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: "Utilisateur invalide" });
  }

  const client = await getPool().connect();
  try {
    await client.query("begin");
    const targetResult = await client.query(`select * from users where id = $1 for update`, [userId]);
    const target = targetResult.rows[0];
    if (!target) {
      await client.query("rollback");
      return res.status(404).json({ error: "Compte introuvable" });
    }
    if (!target.email_verified_at) {
      await client.query("rollback");
      return res.status(409).json({ error: "L’adresse e-mail doit être confirmée avant l’approbation du compte." });
    }
    if (!target.participant_id) {
      await client.query("rollback");
      return res.status(409).json({ error: "Associez d’abord ce compte à une fiche grimpeur avant de l’approuver." });
    }
    if (target.status !== "pending") {
      await client.query("rollback");
      return res.status(409).json({ error: target.status === "active" ? "Ce compte est déjà actif." : "Un compte révoqué doit être réactivé avec l’action dédiée." });
    }

    const participantResult = await client.query(
      `select id, can_admin from participants where id = $1 for update`,
      [target.participant_id],
    );
    const participant = participantResult.rows[0];
    if (!participant) {
      await client.query("rollback");
      return res.status(409).json({ error: "La fiche grimpeur associée n’existe plus." });
    }

    const isAdmin = Boolean(participant.can_admin);
    const updatedResult = await client.query(
      `
        update users
        set status = 'active',
            approved_at = now(),
            revoked_at = null,
            revoked_reason = null,
            role = case when $2 then 'admin' else 'user' end,
            is_admin = $2,
            receive_account_notifications = case when $2 then receive_account_notifications else false end
        where id = $1
        returning *
      `,
      [userId, isAdmin],
    );
    await client.query("commit");

    const updatedUser = updatedResult.rows[0];
    await writeAccessLog({
      userId,
      eventType: "account_approved",
      success: true,
      req,
      details: { by: actorEmail(req), isAdmin },
    });
    await sendApprovalNotificationEmail({ user: updatedUser, req });
    return res.json({ ok: true, user: serializeUser(updatedUser) });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    return res.status(500).json({ error: "Approbation du compte impossible" });
  } finally {
    client.release();
  }
}
