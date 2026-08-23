import { getPool } from "./database.js";
import { writeAccessLog } from "./access-log-service.js";
import { hashToken } from "./security.js";
import { sendAdminAccountRequestReadyEmail } from "./email-service.js";
import { sendApprovalNotificationEmail } from "./account-service.js";

function isAdminUser(user) {
  return Boolean(user && (user.role === "admin" || user.is_admin));
}

function emailLogDetails(result, email) {
  return {
    email,
    delivered: Boolean(result?.sent),
    skipped: Boolean(result?.skipped),
    reason: result?.reason || null,
    messageId: result?.messageId || null,
  };
}

/** Retourne la préférence de notification du compte administrateur connecté. */
export async function getAccountNotificationPreference(req, res) {
  const user = req.enhancementAuth?.user;
  if (!isAdminUser(user)) {
    return res.status(403).json({ error: "Accès administrateur requis" });
  }

  try {
    const result = await getPool().query(
      `select receive_account_notifications from users where id = $1 limit 1`,
      [user.id],
    );
    if (!result.rowCount) return res.status(404).json({ error: "Compte introuvable" });

    return res.json({
      receiveAccountNotifications: result.rows[0].receive_account_notifications === true,
    });
  } catch (error) {
    console.error("Lecture de la préférence de notification impossible :", error);
    return res.status(500).json({ error: "Lecture de la préférence impossible" });
  }
}

/** Met à jour uniquement la préférence du compte administrateur connecté. */
export async function updateAccountNotificationPreference(req, res) {
  const user = req.enhancementAuth?.user;
  if (!isAdminUser(user)) {
    return res.status(403).json({ error: "Accès administrateur requis" });
  }

  const enabled = req.body?.receiveAccountNotifications;
  if (typeof enabled !== "boolean") {
    return res.status(400).json({ error: "Préférence de notification invalide" });
  }

  try {
    const result = await getPool().query(
      `
        update users
        set receive_account_notifications = $2
        where id = $1
        returning receive_account_notifications
      `,
      [user.id, enabled],
    );
    if (!result.rowCount) return res.status(404).json({ error: "Compte introuvable" });

    await writeAccessLog({
      userId: user.id,
      eventType: "account_notification_preference_changed",
      req,
      details: { enabled },
    });

    return res.json({
      ok: true,
      receiveAccountNotifications: result.rows[0].receive_account_notifications === true,
    });
  } catch (error) {
    console.error("Mise à jour de la préférence de notification impossible :", error);
    return res.status(500).json({ error: "Mise à jour de la préférence impossible" });
  }
}

/**
 * Notifie exclusivement les administrateurs actifs qui ont choisi de recevoir
 * les e-mails de demandes de compte. Aucun destinataire n'est codé dans le code.
 */
export async function notifyAccountRequestReviewers({ user, req }) {
  const recipients = await getPool().query(
    `
      select id, email, prenom, nom
      from users
      where status = 'active'
        and (role = 'admin' or is_admin = true)
        and receive_account_notifications = true
        and lower(email) <> lower($1)
      order by id asc
    `,
    [String(user.email || "")],
  );

  for (const reviewer of recipients.rows) {
    try {
      const emailResult = await sendAdminAccountRequestReadyEmail({
        email: reviewer.email,
        prenom: user.prenom,
        nom: user.nom,
        applicantEmail: user.email,
      });
      await writeAccessLog({
        userId: reviewer.id,
        eventType: emailResult.sent
          ? "account_request_ready_admin_email_sent"
          : "account_request_ready_admin_email_skipped",
        success: Boolean(emailResult.sent || emailResult.skipped),
        req,
        details: {
          ...emailLogDetails(emailResult, reviewer.email),
          applicantEmail: user.email,
        },
      });
    } catch (error) {
      console.error("Notification administrateur après confirmation e-mail impossible :", error);
      await writeAccessLog({
        userId: reviewer.id,
        eventType: "account_request_ready_admin_email_failed",
        success: false,
        req,
        details: {
          adminEmail: reviewer.email,
          applicantEmail: user.email,
          error: String(error.message || error),
        },
      });
    }
  }

  return recipients.rowCount;
}

/**
 * Confirmation d'adresse e-mail avec notification pilotée par la préférence des
 * administrateurs, en remplacement de la liste historique de destinataires fixes.
 */
export async function verifyEmailRequestWithNotificationPreferences(req, res) {
  const rawToken = String(req.query?.token || req.body?.token || "").trim();
  if (!rawToken) return res.status(400).send("Lien de confirmation invalide.");

  const tokenHash = hashToken(rawToken);
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const tokenResult = await client.query(
      `
        select evt.id, evt.user_id, evt.expires_at, evt.used_at, u.email, u.prenom, u.nom
        from email_verification_tokens evt
        join users u on u.id = evt.user_id
        where evt.token_hash = $1
        limit 1
      `,
      [tokenHash],
    );

    const tokenRow = tokenResult.rows[0];
    if (!tokenRow) {
      await client.query("rollback");
      return res.status(404).send("Ce lien de confirmation est introuvable ou a déjà été supprimé.");
    }
    if (tokenRow.used_at) {
      await client.query("rollback");
      return res.status(200).send("Cette adresse e-mail a déjà été confirmée.");
    }
    if (new Date(tokenRow.expires_at).getTime() <= Date.now()) {
      await client.query("rollback");
      return res.status(410).send("Ce lien de confirmation a expiré.");
    }

    await client.query(
      `update email_verification_tokens set used_at = now() where id = $1`,
      [tokenRow.id],
    );
    const verifiedUserResult = await client.query(
      `
        update users
        set email_verified_at = coalesce(email_verified_at, now()),
            status = case when status = 'pending' then 'active' else status end,
            approved_at = case when status = 'pending' then coalesce(approved_at, now()) else approved_at end,
            revoked_at = case when status = 'pending' then null else revoked_at end,
            revoked_reason = case when status = 'pending' then null else revoked_reason end
        where id = $1
        returning id, email, prenom, nom, status, approved_at, email_verified_at
      `,
      [tokenRow.user_id],
    );
    await client.query("commit");

    const verifiedUser = verifiedUserResult.rows[0] || {
      id: tokenRow.user_id,
      email: tokenRow.email,
      prenom: tokenRow.prenom,
      nom: tokenRow.nom,
      status: "pending",
    };

    await writeAccessLog({
      userId: tokenRow.user_id,
      eventType: "account_request_email_verified",
      req,
      details: { email: tokenRow.email, activated: verifiedUser.status === "active" },
    });

    if (verifiedUser.status === "active") {
      await sendApprovalNotificationEmail({ user: verifiedUser, req });
    }

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

    return res.status(200).send("Adresse e-mail confirmée. Le compte est désormais actif.");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    return res.status(500).send("La confirmation de l’adresse e-mail a échoué.");
  } finally {
    client.release();
  }
}
