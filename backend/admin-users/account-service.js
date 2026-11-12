import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import {
  BCRYPT_ROUNDS,
} from "./config.js";

const EMAIL_VERIFICATION_DURATION_MS = 1000 * 60 * 60 * 24 * 7;
const EMAIL_CHANGE_TOKEN_DURATION_MS = 1000 * 60 * 60 * 24;
import { getPool } from "./database.js";
import { writeAccessLog } from "./access-log-service.js";
import { cleanEmail, hashToken, isStrongPassword } from "./security.js";
import { serializeUser } from "./user-serializer.js";
import {
  sendAccountApprovedEmail,
  sendAccountRequestConfirmation,
  sendEmailChangeConfirmation,
} from "./email-service.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emailLogDetails(result, email) {
  return {
    email,
    delivered: Boolean(result?.sent),
    skipped: Boolean(result?.skipped),
    reason: result?.reason || null,
    messageId: result?.messageId || null,
  };
}

function getPublicUrl() {
  return String(
    process.env.PUBLIC_URL || process.env.FRONTEND_ORIGIN || process.env.CORS_ORIGIN || ""
  ).split(",")[0].trim().replace(/\/$/, "");
}

function buildEmailVerificationUrl(rawToken) {
  const publicUrl = getPublicUrl();
  return publicUrl ? `${publicUrl}/api/auth/verify-email?token=${encodeURIComponent(rawToken)}` : "";
}

function buildEmailChangeConfirmUrl(rawToken) {
  const publicUrl = getPublicUrl();
  return publicUrl ? `${publicUrl}/api/auth/change-email/confirm?token=${encodeURIComponent(rawToken)}` : "";
}

export async function sendApprovalNotificationEmail({ user, req }) {
  try {
    const emailResult = await sendAccountApprovedEmail({
      email: user.email,
      prenom: user.prenom,
      nom: user.nom,
    });
    await writeAccessLog({
      userId: user.id,
      eventType: emailResult.sent
        ? "account_approved_email_sent"
        : "account_approved_email_skipped",
      success: Boolean(emailResult.sent || emailResult.skipped),
      req,
      details: emailLogDetails(emailResult, user.email),
    });
  } catch (error) {
    console.error("Envoi du mail d’autorisation de compte impossible :", error);
    await writeAccessLog({
      userId: user.id,
      eventType: "account_approved_email_failed",
      success: false,
      req,
      details: { email: user.email, error: String(error.message || error) },
    });
  }
}

export async function listUsers(_req, res) {
  try {
    const result = await getPool().query(`
      select
        u.id, u.participant_id, u.email, u.prenom, u.nom, u.role, u.is_admin, u.status,
        u.must_reset_password, u.created_at, u.approved_at, u.revoked_at,
        u.revoked_reason, u.last_login_at, u.theme_preference, u.email_verified_at,
        mail.event_type as confirmation_email_event,
        mail.success as confirmation_email_success,
        mail.created_at as confirmation_email_at,
        mail.details as confirmation_email_details
      from users u
      left join lateral (
        select al.event_type, al.success, al.created_at, al.details
        from access_logs al
        where al.user_id = u.id
          and al.event_type in (
            'account_request_confirmation_email_sent',
            'account_request_confirmation_email_skipped',
            'account_request_confirmation_email_failed'
          )
        order by al.created_at desc, al.id desc
        limit 1
      ) mail on true
      order by case u.status when 'pending' then 0 when 'active' then 1 when 'revoked' then 2 else 3 end,
               u.created_at desc, u.email asc
    `);
    res.json({
      ok: true,
      users: result.rows.map((row) => ({
        ...serializeUser(row),
        confirmationEmail: row.confirmation_email_event ? {
          status: row.confirmation_email_event.endsWith('_sent')
            ? 'sent'
            : row.confirmation_email_event.endsWith('_skipped')
              ? 'skipped'
              : 'failed',
          success: Boolean(row.confirmation_email_success),
          at: row.confirmation_email_at,
          reason: row.confirmation_email_details?.reason || null,
          messageId: row.confirmation_email_details?.messageId || null,
        } : null,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) });
  }
}

export async function resendAccountConfirmationEmail(req, res) {
  const userId = Number(req.params?.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: "Utilisateur invalide" });
  }

  const client = await getPool().connect();
  try {
    await client.query("begin");
    const userResult = await client.query(
      `
        select id, email, prenom, nom, status, email_verified_at
        from users
        where id = $1
        for update
      `,
      [userId],
    );
    const user = userResult.rows[0];
    if (!user) {
      await client.query("rollback");
      return res.status(404).json({ error: "Compte introuvable" });
    }
    if (user.email_verified_at) {
      await client.query("rollback");
      return res.status(409).json({ error: "Cette adresse e-mail est déjà confirmée." });
    }
    if (user.status !== "pending") {
      await client.query("rollback");
      return res.status(409).json({ error: "Seul un compte en attente peut recevoir un nouvel e-mail de confirmation." });
    }

    const verificationToken = crypto.randomBytes(24).toString("hex");
    const verificationTokenHash = hashToken(verificationToken);
    const verificationExpiresAt = new Date(Date.now() + EMAIL_VERIFICATION_DURATION_MS).toISOString();

    await client.query(
      `
        update email_verification_tokens
        set used_at = coalesce(used_at, now())
        where user_id = $1 and used_at is null
      `,
      [userId],
    );
    await client.query(
      `
        insert into email_verification_tokens (user_id, token_hash, expires_at)
        values ($1, $2, $3)
      `,
      [userId, verificationTokenHash, verificationExpiresAt],
    );
    await client.query("commit");

    try {
      const emailResult = await sendAccountRequestConfirmation({
        email: user.email,
        prenom: user.prenom,
        nom: user.nom,
        verificationUrl: buildEmailVerificationUrl(verificationToken),
      });
      await writeAccessLog({
        userId,
        eventType: emailResult.sent
          ? "account_request_confirmation_email_sent"
          : "account_request_confirmation_email_skipped",
        success: Boolean(emailResult.sent || emailResult.skipped),
        req,
        details: {
          ...emailLogDetails(emailResult, user.email),
          verificationExpiresAt,
          resentByAdmin: req.auth?.user?.email || req.enhancementAuth?.user?.email || null,
        },
      });
      if (!emailResult.sent) {
        return res.status(503).json({
          ok: false,
          error: emailResult.reason === "email_disabled"
            ? "L’envoi d’e-mail est désactivé sur le serveur."
            : "Le serveur n’a pas envoyé l’e-mail de confirmation.",
        });
      }
      return res.json({
        ok: true,
        message: `E-mail de confirmation renvoyé à ${user.email}.`,
        sentAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Renvoi de l’e-mail de confirmation impossible :", error);
      await writeAccessLog({
        userId,
        eventType: "account_request_confirmation_email_failed",
        success: false,
        req,
        details: {
          email: user.email,
          error: String(error.message || error),
          resentByAdmin: req.auth?.user?.email || req.enhancementAuth?.user?.email || null,
        },
      });
      return res.status(502).json({ error: "L’envoi SMTP de l’e-mail de confirmation a échoué." });
    }
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    return res.status(500).json({ error: "Le renvoi de l’e-mail de confirmation a échoué." });
  } finally {
    client.release();
  }
}

/**
 * Active ou retire le droit administrateur et synchronise le participant lié.
 * Une protection empêche la suppression du dernier administrateur actif.
 */
export async function changePassword(req, res) {
  const user = req.enhancementAuth.user;
  const currentPassword = String(req.body?.currentPassword || "");
  const newPassword = String(req.body?.newPassword || "");

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Mot de passe actuel et nouveau mot de passe requis" });
  }
  if (!isStrongPassword(newPassword)) {
    return res.status(400).json({ error: "Le nouveau mot de passe est insuffisamment robuste" });
  }

  try {
    const passwordMatches = await bcrypt.compare(currentPassword, user.password_hash);
    if (!passwordMatches) {
      await writeAccessLog({
        userId: user.id,
        eventType: "password_change_rejected",
        success: false,
        req,
        details: { reason: "invalid_current_password" },
      });
      return res.status(401).json({ error: "Mot de passe actuel incorrect" });
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const pool = getPool();
    await pool.query(
      `update users set password_hash = $2, must_reset_password = false where id = $1`,
      [user.id, passwordHash]
    );
    await pool.query(
      `update user_sessions set revoked_at = now() where user_id = $1 and revoked_at is null and id <> $2`,
      [user.id, user.session_id]
    );

    await writeAccessLog({
      userId: user.id,
      eventType: "password_changed",
      req,
      details: {},
    });

    res.json({ ok: true, message: "Mot de passe mis à jour." });
  } catch (error) {
    console.error("Changement de mot de passe impossible :", error);
    res.status(500).json({ error: "Le changement de mot de passe a échoué" });
  }
}

/**
 * Demande un changement d'adresse e-mail : un e-mail de confirmation est
 * envoyé à la NOUVELLE adresse et le changement n'est appliqué qu'après
 * confirmation, afin d'éviter toute perte d'accès au compte.
 */
export async function requestEmailChange(req, res) {
  const user = req.enhancementAuth.user;
  const newEmail = cleanEmail(req.body?.newEmail);
  const currentPassword = String(req.body?.currentPassword || "");

  if (!newEmail || !currentPassword) {
    return res.status(400).json({ error: "Nouvelle adresse e-mail et mot de passe actuel requis" });
  }
  if (!EMAIL_PATTERN.test(newEmail)) {
    return res.status(400).json({ error: "Adresse e-mail invalide" });
  }
  if (newEmail === cleanEmail(user.email)) {
    return res.status(400).json({ error: "Cette adresse est déjà celle de ton compte" });
  }

  try {
    const passwordMatches = await bcrypt.compare(currentPassword, user.password_hash);
    if (!passwordMatches) {
      await writeAccessLog({
        userId: user.id,
        eventType: "email_change_rejected",
        success: false,
        req,
        details: { reason: "invalid_current_password" },
      });
      return res.status(401).json({ error: "Mot de passe actuel incorrect" });
    }

    const pool = getPool();
    const existing = await pool.query(`select id from users where climbcrew_normalize_email(email) = climbcrew_normalize_email($1) limit 1`, [newEmail]);
    if (existing.rowCount) {
      return res.status(409).json({ error: "Un compte existe déjà avec cette adresse" });
    }

    const participantConflict = await pool.query(
      `
        select id
        from participants
        where climbcrew_normalize_email(coalesce(login_email, '')) = climbcrew_normalize_email($1)
          and ($2::bigint is null or id <> $2::bigint)
        limit 1
      `,
      [newEmail, user.participant_id || null]
    );
    if (participantConflict.rowCount) {
      return res.status(409).json({ error: "Un autre profil grimpeur utilise déjà cette adresse e-mail" });
    }

    const rawToken = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + EMAIL_CHANGE_TOKEN_DURATION_MS).toISOString();

    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `update email_change_tokens set used_at = now() where user_id = $1 and used_at is null`,
        [user.id]
      );
      await client.query(
        `insert into email_change_tokens (user_id, new_email, token_hash, expires_at) values ($1, $2, $3, $4)`,
        [user.id, newEmail, hashToken(rawToken), expiresAt]
      );
      await client.query(`update users set pending_email = $2 where id = $1`, [user.id, newEmail]);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }

    let emailSent = false;
    try {
      const emailResult = await sendEmailChangeConfirmation({
        email: newEmail,
        prenom: user.prenom,
        newEmail,
        confirmUrl: buildEmailChangeConfirmUrl(rawToken),
        expiresAt,
      });
      emailSent = Boolean(emailResult.sent);
      await writeAccessLog({
        userId: user.id,
        eventType: emailResult.sent ? "email_change_requested_email_sent" : "email_change_requested_email_skipped",
        success: Boolean(emailResult.sent || emailResult.skipped),
        req,
        details: { ...emailLogDetails(emailResult, newEmail), expiresAt },
      });
    } catch (error) {
      console.error("Envoi de la confirmation de changement d’e-mail impossible :", error);
      await writeAccessLog({
        userId: user.id,
        eventType: "email_change_requested_email_failed",
        success: false,
        req,
        details: { newEmail, error: String(error.message || error) },
      });
    }

    res.json({
      ok: true,
      message: emailSent
        ? "Un e-mail de confirmation a été envoyé à la nouvelle adresse. Le changement ne sera appliqué qu’après avoir cliqué sur le lien reçu."
        : "La demande a été enregistrée mais l’e-mail de confirmation n’a pas pu être envoyé.",
      emailSent,
      pendingEmail: newEmail,
    });
  } catch (error) {
    console.error("Demande de changement d’e-mail impossible :", error);
    res.status(500).json({ error: "La demande de changement d’adresse e-mail a échoué" });
  }
}

/** Finalise un changement d'adresse e-mail à partir du lien reçu par e-mail. */
export async function confirmEmailChange(req, res) {
  const rawToken = String(req.query?.token || req.body?.token || "").trim();
  if (!rawToken) return res.status(400).send("Lien de confirmation invalide.");

  const tokenHash = hashToken(rawToken);
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const tokenResult = await client.query(
      `select * from email_change_tokens where token_hash = $1 limit 1`,
      [tokenHash]
    );

    const tokenRow = tokenResult.rows[0];
    if (!tokenRow) {
      await client.query("rollback");
      return res.status(404).send("Ce lien de confirmation est introuvable ou a déjà été utilisé.");
    }
    if (tokenRow.used_at) {
      await client.query("rollback");
      return res.status(200).send("Ce changement d’adresse e-mail a déjà été confirmé.");
    }
    if (new Date(tokenRow.expires_at).getTime() <= Date.now()) {
      await client.query("rollback");
      return res.status(410).send("Ce lien de confirmation a expiré. Relance le changement d’adresse depuis les paramètres du compte.");
    }

    const conflict = await client.query(
      `select id from users where climbcrew_normalize_email(email) = climbcrew_normalize_email($1) and id <> $2 limit 1`,
      [tokenRow.new_email, tokenRow.user_id]
    );
    if (conflict.rowCount) {
      await client.query("rollback");
      return res.status(409).send("Cette adresse e-mail est désormais utilisée par un autre compte.");
    }

    const participantConflict = await client.query(
      `
        select p.id
        from participants p
        where climbcrew_normalize_email(coalesce(p.login_email, '')) = climbcrew_normalize_email($1)
          and p.id <> coalesce((select participant_id from users where id = $2), -1::bigint)
        limit 1
      `,
      [tokenRow.new_email, tokenRow.user_id]
    );
    if (participantConflict.rowCount) {
      await client.query("rollback");
      return res.status(409).send("Cette adresse e-mail est désormais utilisée par un autre profil grimpeur.");
    }

    await client.query(`update email_change_tokens set used_at = now() where id = $1`, [tokenRow.id]);
    await client.query(
      `update users set email = $2, pending_email = null, email_verified_at = now() where id = $1`,
      [tokenRow.user_id, tokenRow.new_email]
    );
    await client.query(
      `
        update participants p
        set login_email = $2
        from users u
        where u.participant_id = p.id
          and u.id = $1
      `,
      [tokenRow.user_id, cleanEmail(tokenRow.new_email)]
    );
    await client.query("commit");

    await writeAccessLog({
      userId: tokenRow.user_id,
      eventType: "email_changed",
      req,
      details: { newEmail: cleanEmail(tokenRow.new_email) },
    });

    return res.status(200).send("Adresse e-mail confirmée et mise à jour. Tu peux désormais te connecter avec cette nouvelle adresse.");
  } catch (error) {
    await client.query("rollback");
    console.error("Confirmation du changement d’adresse e-mail impossible :", error);
    return res.status(500).send("La confirmation du changement d’adresse e-mail a échoué.");
  } finally {
    client.release();
  }
}
