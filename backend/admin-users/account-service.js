import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { BCRYPT_ROUNDS, RESET_TOKEN_DURATION_MS } from "./config.js";

const EMAIL_VERIFICATION_DURATION_MS = 1000 * 60 * 60 * 24 * 7;
const EMAIL_CHANGE_TOKEN_DURATION_MS = 1000 * 60 * 60 * 24;
import { getPool } from "./database.js";
import { writeAccessLog } from "./access-log-service.js";
import { cleanEmail, hashToken, isStrongPassword } from "./security.js";
import { serializeUser } from "./user-serializer.js";
import {
  sendAccountApprovedEmail,
  sendAccountRequestConfirmation,
  sendAdminAccountRequestReadyEmail,
  sendEmailChangeConfirmation,
  sendPasswordResetCode,
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

/**
 * Destinataires fixes des notifications de demande de compte confirmée.
 * Volontairement indépendant de la table users : le statut administrateur
 * d'un compte ne doit pas suffire à l'abonner à ces e-mails (cf. compte
 * administrateur externe ayant reçu ces notifications par erreur).
 */
const ACCOUNT_REQUEST_NOTIFICATION_RECIPIENTS = [
  "thithi.petit@gmail.com",
  "fabien.alcouffe@thalesgroup.com",
];

async function notifyAccountRequestReviewers({ user, req }) {
  const recipients = ACCOUNT_REQUEST_NOTIFICATION_RECIPIENTS.filter(
    (email) => email.toLowerCase() !== String(user.email || "").trim().toLowerCase()
  );

  for (const email of recipients) {
    try {
      const emailResult = await sendAdminAccountRequestReadyEmail({
        email,
        prenom: user.prenom,
        nom: user.nom,
        applicantEmail: user.email,
      });
      await writeAccessLog({
        userId: user.id,
        eventType: emailResult.sent
          ? "account_request_ready_admin_email_sent"
          : "account_request_ready_admin_email_skipped",
        success: Boolean(emailResult.sent || emailResult.skipped),
        req,
        details: {
          ...emailLogDetails(emailResult, email),
          applicantEmail: user.email,
        },
      });
    } catch (error) {
      console.error("Notification admin après confirmation e-mail impossible :", error);
      await writeAccessLog({
        userId: user.id,
        eventType: "account_request_ready_admin_email_failed",
        success: false,
        req,
        details: {
          adminEmail: email,
          applicantEmail: user.email,
          error: String(error.message || error),
        },
      });
    }
  }
}

/**
 * Associe un compte au profil grimpeur portant la même adresse e-mail.
 * Le prénom et le nom ne servent jamais de clé de rapprochement : ils restent
 * des informations descriptives. En l'absence de profil correspondant, un
 * participant minimal est créé avec l'adresse e-mail normalisée du compte.
 */
export async function requestAccess(req, res) {
  const prenom = String(req.body?.prenom || "").trim();
  const nom = String(req.body?.nom || "").trim();
  const email = cleanEmail(req.body?.email);
  const password = String(req.body?.password || "");
  const acceptTerms = Boolean(req.body?.acceptTerms);

  if (!prenom || !nom || !email) return res.status(400).json({ error: "Prénom, nom et email sont requis" });
  if (!acceptTerms) return res.status(400).json({ error: "Les conditions d’utilisation doivent être acceptées" });
  if (!isStrongPassword(password)) return res.status(400).json({ error: "Mot de passe insuffisamment robuste" });

  const client = await getPool().connect();
  try {
    await client.query("begin");

    const existing = await client.query(`select id from users where lower(email) = $1 limit 1`, [email]);
    if (existing.rowCount) {
      await client.query("rollback");
      return res.status(409).json({ error: "Un compte existe déjà pour cet email" });
    }

    const participantResult = await client.query(
      `
        select p.id,
               exists(select 1 from users u where u.participant_id = p.id) as already_linked
        from participants p
        where lower(trim(coalesce(p.login_email, ''))) = $1
        order by p.id asc
        limit 2
      `,
      [email]
    );

    if (participantResult.rowCount > 1) {
      await client.query("rollback");
      return res.status(409).json({
        error: "Plusieurs profils grimpeurs utilisent cette adresse e-mail. Un administrateur doit corriger les données avant de créer le compte.",
      });
    }

    let participantId = participantResult.rows[0]?.id || null;
    let participantCreated = false;

    if (participantId && participantResult.rows[0].already_linked) {
      await client.query("rollback");
      return res.status(409).json({
        error: "Le profil grimpeur correspondant à cette adresse e-mail est déjà associé à un compte.",
      });
    }

    if (!participantId) {
      const createdParticipant = await client.query(
        `
          insert into participants (
            nom, prenom, passport, cotisation, ffme,
            can_encadrer, can_referer, can_admin, login_email
          ) values ($1, $2, 'sans', false, false, false, false, false, $3)
          returning id
        `,
        [nom, prenom, email]
      );
      participantId = createdParticipant.rows[0].id;
      participantCreated = true;
    } else {
      await client.query(`update participants set login_email = $2 where id = $1`, [participantId, email]);
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const verificationToken = crypto.randomBytes(24).toString("hex");
    const verificationTokenHash = hashToken(verificationToken);
    const verificationExpiresAt = new Date(Date.now() + EMAIL_VERIFICATION_DURATION_MS).toISOString();
    const userResult = await client.query(
      `
        insert into users (
          participant_id, email, prenom, nom, password_hash,
          role, is_admin, status
        ) values ($1, $2, $3, $4, $5, 'user', false, 'pending')
        returning *
      `,
      [participantId, email, prenom, nom, passwordHash]
    );

    const user = userResult.rows[0];
    await client.query(
      `
        insert into email_verification_tokens (user_id, token_hash, expires_at)
        values ($1, $2, $3)
      `,
      [user.id, verificationTokenHash, verificationExpiresAt]
    );

    await client.query("commit");
    await writeAccessLog({
      userId: user.id,
      eventType: "request_access",
      req,
      details: { email, participantId: String(participantId), participantCreated, matchingKey: "email" },
    });

    let emailSent = false;
    try {
      const emailResult = await sendAccountRequestConfirmation({
        email,
        prenom,
        nom,
        verificationUrl: buildEmailVerificationUrl(verificationToken),
      });
      emailSent = Boolean(emailResult.sent);
      await writeAccessLog({
        userId: user.id,
        eventType: emailResult.sent
          ? "account_request_confirmation_email_sent"
          : "account_request_confirmation_email_skipped",
        success: Boolean(emailResult.sent || emailResult.skipped),
        req,
        details: {
          ...emailLogDetails(emailResult, email),
          verificationExpiresAt,
        },
      });
    } catch (error) {
      console.error("Envoi de la confirmation de création de compte impossible :", error);
      await writeAccessLog({
        userId: user.id,
        eventType: "account_request_confirmation_email_failed",
        success: false,
        req,
        details: { email, error: String(error.message || error) },
      });
    }

    res.json({
      ok: true,
      message: emailSent
        ? "Demande d’accès enregistrée. Un e-mail de confirmation a été envoyé. Le compte sera activé automatiquement dès que l’adresse e-mail sera vérifiée."
        : "Demande d’accès enregistrée, mais la confirmation par e-mail n’a pas pu être envoyée. Le compte restera inactif tant que l’adresse e-mail n’aura pas été vérifiée.",
      user: serializeUser(user),
      participantCreated,
      emailSent,
    });
  } catch (error) {
    await client.query("rollback");
    res.status(500).json({ error: String(error.message || error) });
  } finally {
    client.release();
  }
}

/**
 * Génère un code temporaire et l'envoie par e-mail lorsque le compte est actif.
 * La réponse reste volontairement générique afin de ne pas révéler si une adresse existe.
 */
export async function verifyEmailRequest(req, res) {
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
      [tokenHash]
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
      [tokenRow.id]
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
      [tokenRow.user_id]
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
      await sendApprovalNotificationEmail({
        user: verifiedUser,
        req,
      });
    }

    await notifyAccountRequestReviewers({
      user: {
        id: verifiedUser.id,
        email: verifiedUser.email,
        prenom: verifiedUser.prenom,
        nom: verifiedUser.nom,
      },
      req,
    });

    return res.status(200).send("Adresse e-mail confirmée. Le compte est désormais actif et la demande a aussi été transmise aux administrateurs pour suivi manuel si nécessaire.");
  } catch (error) {
    await client.query("rollback");
    return res.status(500).send("La confirmation de l’adresse e-mail a échoué.");
  } finally {
    client.release();
  }
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

export async function forgotPassword(req, res) {
  const email = cleanEmail(req.body?.email);
  const genericMessage = "Si un compte actif correspond à cette adresse, un code de réinitialisation valable une heure a été envoyé par e-mail. Vérifie également les courriers indésirables.";

  if (!email) return res.status(400).json({ error: "Email requis" });

  try {
    const userResult = await getPool().query(
      `select id, email, prenom, nom, status from users where lower(email) = $1 limit 1`,
      [email]
    );
    const user = userResult.rows[0] || null;

    await writeAccessLog({
      userId: user?.id || null,
      eventType: "forgot_password_requested",
      req,
      details: { email },
    });

    if (!user || user.status !== "active") {
      return res.json({ ok: true, message: genericMessage });
    }

    const resetCode = crypto.randomBytes(4).toString("hex").toUpperCase();
    const expiresAt = new Date(Date.now() + RESET_TOKEN_DURATION_MS).toISOString();
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query("begin");
      await client.query(
        `update password_reset_tokens set used_at = now() where user_id = $1 and used_at is null`,
        [user.id]
      );
      await client.query(
        `
          insert into password_reset_tokens (user_id, token_hash, expires_at)
          values ($1, $2, $3)
        `,
        [user.id, hashToken(resetCode), expiresAt]
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }

    try {
      const emailResult = await sendPasswordResetCode({
        email: user.email,
        prenom: user.prenom,
        code: resetCode,
        expiresAt,
      });

      if (!emailResult.sent) {
        await pool.query(
          `update password_reset_tokens set used_at = now() where user_id = $1 and token_hash = $2 and used_at is null`,
          [user.id, hashToken(resetCode)]
        );
      }

      await writeAccessLog({
        userId: user.id,
        eventType: emailResult.sent
          ? "password_reset_email_sent"
          : "password_reset_email_skipped",
        success: Boolean(emailResult.sent),
        req,
        details: {
          ...emailLogDetails(emailResult, email),
          expiresAt,
        },
      });
    } catch (error) {
      await pool.query(
        `update password_reset_tokens set used_at = now() where user_id = $1 and token_hash = $2 and used_at is null`,
        [user.id, hashToken(resetCode)]
      );
      console.error("Envoi du code de réinitialisation impossible :", error);
      await writeAccessLog({
        userId: user.id,
        eventType: "password_reset_email_failed",
        success: false,
        req,
        details: { email, expiresAt, error: String(error.message || error) },
      });
    }

    return res.json({ ok: true, message: genericMessage });
  } catch (error) {
    console.error("Traitement mot de passe perdu impossible :", error);
    return res.status(500).json({ error: "La demande de réinitialisation ne peut pas être traitée pour le moment" });
  }
}

/** Liste les comptes pour l'écran réservé aux administrateurs. */
export async function listUsers(_req, res) {
  try {
    const result = await getPool().query(`
      select id, participant_id, email, prenom, nom, role, is_admin, status,
             must_reset_password, created_at, approved_at, revoked_at,
             revoked_reason, last_login_at, theme_preference, email_verified_at
      from users
      where status <> 'pending'
         or email_verified_at is not null
         or participant_id is not null
      order by case status when 'pending' then 0 when 'active' then 1 when 'revoked' then 2 else 3 end,
               created_at desc, email asc
    `);
    res.json({ ok: true, users: result.rows.map(serializeUser) });
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) });
  }
}

/**
 * Active ou retire le droit administrateur et synchronise le participant lié.
 * Une protection empêche la suppression du dernier administrateur actif.
 */
export async function updateAdminRight(req, res) {
  const userId = Number(req.params.id);
  const isAdmin = Boolean(req.body?.isAdmin);
  if (!Number.isFinite(userId)) return res.status(400).json({ error: "Utilisateur invalide" });

  const client = await getPool().connect();
  try {
    await client.query("begin");
    const targetResult = await client.query(`select * from users where id = $1 for update`, [userId]);
    const target = targetResult.rows[0];
    if (!target) {
      await client.query("rollback");
      return res.status(404).json({ error: "Compte introuvable" });
    }

    const targetIsActiveAdmin = target.status === "active" && (target.role === "admin" || target.is_admin);
    if (!isAdmin && targetIsActiveAdmin) {
      const otherAdmins = await client.query(
        `select count(*)::int as count from users where id <> $1 and status = 'active' and (role = 'admin' or is_admin = true)`,
        [userId]
      );
      if (otherAdmins.rows[0].count < 1) {
        await client.query("rollback");
        return res.status(409).json({ error: "Impossible de retirer le dernier administrateur actif" });
      }
    }

    const updatedResult = await client.query(
      `
        update users
        set is_admin = $2,
            role = case when $2 then 'admin' else 'user' end
        where id = $1
        returning *
      `,
      [userId, isAdmin]
    );

    if (target.participant_id) {
      await client.query(
        `update participants set can_admin = $2, login_email = $3 where id = $1`,
        [target.participant_id, isAdmin, cleanEmail(target.email)]
      );
    }

    await client.query("commit");

    await writeAccessLog({
      userId,
      eventType: "administrator_right_changed",
      req,
      details: { isAdmin, changedBy: req.enhancementAuth.user.email },
    });

    res.json({ ok: true, user: serializeUser(updatedResult.rows[0]) });
  } catch (error) {
    await client.query("rollback");
    res.status(500).json({ error: String(error.message || error) });
  } finally {
    client.release();
  }
}

/**
 * Paramètres du compte (libre-service)
 */

/** Change le mot de passe du compte connecté après vérification de l'actuel. */
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
    const existing = await pool.query(`select id from users where lower(email) = $1 limit 1`, [newEmail]);
    if (existing.rowCount) {
      return res.status(409).json({ error: "Un compte existe déjà avec cette adresse" });
    }

    const participantConflict = await pool.query(
      `
        select id
        from participants
        where lower(trim(coalesce(login_email, ''))) = $1
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
      `select id from users where lower(email) = $1 and id <> $2 limit 1`,
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
        where lower(trim(coalesce(p.login_email, ''))) = $1
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
