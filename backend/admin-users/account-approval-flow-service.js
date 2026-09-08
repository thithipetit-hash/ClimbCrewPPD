import { REQUIRE_ADMIN_ACCOUNT_APPROVAL } from "./config.js";
import { getPool } from "./database.js";
import { writeAccessLog } from "./access-log-service.js";
import { hashToken } from "./security.js";
import { serializeUser } from "./user-serializer.js";
import { notifyAccountRequestReviewers } from "./account-notification-preference-service.js";
import { findParticipantByEmailOnly } from "./email-association-service.js";
import { sendApprovalNotificationEmail } from "./account-service.js";

/**
 * Recherche/crée la fiche grimpeur correspondante et l'associe au compte.
 * Appelée uniquement après confirmation de l'adresse e-mail : associer un
 * compte non vérifié permettait à une inscription jamais confirmée de
 * verrouiller indéfiniment une fiche, invisible pour un administrateur.
 */
async function ensureParticipantAfterEmailVerification(client, user) {
  if (user.participant_id) {
    const current = await client.query(
      `select id, can_admin from participants where id = $1 for update`,
      [user.participant_id],
    );
    if (current.rowCount === 1) return current.rows[0];
  }

  const match = await findParticipantByEmailOnly(client, {
    email: user.email,
    userId: user.id,
  });

  if (match.participantId) {
    const participantResult = await client.query(
      `select id, can_admin from participants where id = $1 for update`,
      [match.participantId],
    );
    const participant = participantResult.rows[0] || null;
    if (!participant) return null;

    await client.query(
      `update users set participant_id = $2 where id = $1`,
      [user.id, participant.id],
    );
    await client.query(
      `update participants set login_email = $2 where id = $1`,
      [participant.id, user.email],
    );
    return participant;
  }

  if (match.issue !== "email_not_found") return null;

  const created = await client.query(
    `
      insert into participants (
        nom, prenom, email, login_email, passport, cotisation, ffme,
        can_encadrer, can_referer, can_admin
      ) values ($1, $2, $3, $3, 'sans', false, false, false, false, false)
      returning id, can_admin
    `,
    [user.nom, user.prenom, user.email],
  );
  const participant = created.rows[0];
  await client.query(
    `update users set participant_id = $2 where id = $1`,
    [user.id, participant.id],
  );
  return participant;
}

/**
 * Valide la propriété de l'adresse e-mail puis applique la politique courante.
 * Par défaut l'approbation administrateur est désactivée : un compte `pending`
 * est activé immédiatement après vérification de l'e-mail. La politique reste
 * configurable afin de pouvoir rétablir ultérieurement l'approbation manuelle.
 */
export async function verifyEmailPendingAdminApproval(req, res) {
  const rawToken = String(req.query?.token || req.body?.token || "").trim();
  if (!rawToken) return res.status(400).send("Lien de confirmation invalide.");

  const tokenHash = hashToken(rawToken);
  const client = await getPool().connect();

  try {
    await client.query("begin");
    const tokenResult = await client.query(
      `
        select evt.id, evt.user_id, evt.expires_at, evt.used_at,
               u.id as user_id, u.email, u.prenom, u.nom, u.status,
               u.email_verified_at, u.participant_id
        from email_verification_tokens evt
        join users u on u.id = evt.user_id
        where evt.token_hash = $1
        limit 1
        for update of evt
      `,
      [tokenHash],
    );

    const tokenRow = tokenResult.rows[0];
    if (!tokenRow) {
      await client.query("rollback");
      return res.status(404).send("Ce lien de confirmation est introuvable ou a déjà été supprimé.");
    }

    if (tokenRow.used_at && tokenRow.status === "active") {
      await client.query("rollback");
      return res.status(200).send("Cette adresse e-mail a déjà été confirmée et le compte est actif.");
    }
    if (tokenRow.used_at && REQUIRE_ADMIN_ACCOUNT_APPROVAL) {
      await client.query("rollback");
      return res.status(200).send(
        "Cette adresse e-mail a déjà été confirmée. Le compte reste en attente d’approbation par un administrateur.",
      );
    }
    if (!tokenRow.used_at && new Date(tokenRow.expires_at).getTime() <= Date.now()) {
      await client.query("rollback");
      return res.status(410).send("Ce lien de confirmation a expiré.");
    }

    if (!tokenRow.used_at) {
      await client.query(
        `update email_verification_tokens set used_at = now() where id = $1`,
        [tokenRow.id],
      );
    }

    let participant = null;
    if (tokenRow.status === "pending") {
      participant = await ensureParticipantAfterEmailVerification(client, tokenRow);
    }

    const autoActivate = Boolean(
      !REQUIRE_ADMIN_ACCOUNT_APPROVAL
      && tokenRow.status === "pending"
      && participant,
    );
    const isAdmin = Boolean(autoActivate && participant?.can_admin);

    const verifiedUserResult = await client.query(
      `
        update users
        set email_verified_at = coalesce(email_verified_at, now()),
            status = case when $2 then 'active' else status end,
            approved_at = case when $2 then coalesce(approved_at, now()) else approved_at end,
            revoked_at = case when $2 then null else revoked_at end,
            revoked_reason = case when $2 then null else revoked_reason end,
            role = case when $2 then case when $3 then 'admin' else 'user' end else role end,
            is_admin = case when $2 then $3 else is_admin end,
            receive_account_notifications = case
              when $2 and not $3 then false
              else receive_account_notifications
            end
        where id = $1
        returning id, participant_id, email, prenom, nom, role, is_admin,
                  status, approved_at, email_verified_at
      `,
      [tokenRow.user_id, autoActivate, isAdmin],
    );
    await client.query("commit");

    const verifiedUser = verifiedUserResult.rows[0];

    await writeAccessLog({
      userId: verifiedUser.id,
      eventType: autoActivate
        ? "account_request_email_verified_auto_activated"
        : "account_request_email_verified",
      req,
      details: {
        email: verifiedUser.email,
        status: verifiedUser.status,
        autoActivated: autoActivate,
        awaitingAdminApproval: REQUIRE_ADMIN_ACCOUNT_APPROVAL && verifiedUser.status === "pending",
        participantId: verifiedUser.participant_id ? String(verifiedUser.participant_id) : null,
        isAdmin: Boolean(verifiedUser.is_admin),
      },
    });

    if (verifiedUser.status === "pending" || autoActivate) {
      try {
        await notifyAccountRequestReviewers({ user: verifiedUser, req });
      } catch (error) {
        console.error("Recherche des administrateurs à notifier impossible :", error);
        await writeAccessLog({
          userId: verifiedUser.id,
          eventType: "account_request_ready_admin_lookup_failed",
          success: false,
          req,
          details: { error: String(error.message || error) },
        });
      }
    }

    if (autoActivate) {
      return res.status(200).send(
        "Adresse e-mail confirmée. Votre compte est maintenant actif. Vous pouvez vous connecter à ClimbCrew.",
      );
    }

    if (REQUIRE_ADMIN_ACCOUNT_APPROVAL && verifiedUser.status === "pending") {
      return res.status(200).send(
        "Adresse e-mail confirmée. Votre demande est maintenant en attente d’approbation par un administrateur.",
      );
    }

    if (verifiedUser.status === "pending") {
      return res.status(200).send(
        "Adresse e-mail confirmée, mais l’association automatique du compte n’a pas pu être finalisée. Un administrateur doit corriger les données d’association.",
      );
    }

    return res.status(200).send("Adresse e-mail confirmée.");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    console.error("Confirmation de l’adresse e-mail impossible :", error);
    return res.status(500).send("La confirmation de l’adresse e-mail a échoué.");
  } finally {
    client.release();
  }
}

/**
 * Le contrôleur d'approbation reste disponible lorsque la politique manuelle est
 * réactivée ou pour régulariser exceptionnellement un compte resté `pending`.
 */
export async function approveVerifiedAccount(req, res) {
  const userId = Number(req.params?.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: "Utilisateur invalide" });
  }

  const client = await getPool().connect();
  try {
    await client.query("begin");
    const targetResult = await client.query(
      `select * from users where id = $1 for update`,
      [userId],
    );
    const target = targetResult.rows[0];

    if (!target) {
      await client.query("rollback");
      return res.status(404).json({ error: "Compte introuvable" });
    }
    if (!target.email_verified_at) {
      await client.query("rollback");
      return res.status(409).json({
        error: "L’adresse e-mail doit être confirmée avant l’approbation du compte.",
      });
    }
    if (!target.participant_id) {
      await client.query("rollback");
      return res.status(409).json({
        error: "Associez d’abord ce compte à une fiche grimpeur avant de l’approuver.",
      });
    }
    if (target.status !== "pending") {
      await client.query("rollback");
      return res.status(409).json({
        error: target.status === "active"
          ? "Ce compte est déjà actif."
          : "Un compte révoqué doit être réactivé avec l’action dédiée.",
      });
    }

    const updatedResult = await client.query(
      `
        update users
        set status = 'active',
            approved_at = now(),
            revoked_at = null,
            revoked_reason = null
        where id = $1
        returning *
      `,
      [userId],
    );
    await client.query("commit");

    const updatedUser = updatedResult.rows[0];
    await writeAccessLog({
      userId,
      eventType: "account_approved",
      success: true,
      req,
      details: { by: req.auth?.user?.email || req.enhancementAuth?.user?.email || null },
    });

    await sendApprovalNotificationEmail({ user: updatedUser, req });
    return res.json({ ok: true, user: serializeUser(updatedUser) });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    console.error("Approbation du compte impossible :", error);
    return res.status(500).json({ error: "Approbation du compte impossible" });
  } finally {
    client.release();
  }
}
