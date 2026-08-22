import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { BCRYPT_ROUNDS } from "./config.js";
import { getPool } from "./database.js";
import { writeAccessLog } from "./access-log-service.js";
import { cleanEmail, hashToken, isStrongPassword } from "./security.js";
import { serializeUser } from "./user-serializer.js";
import { sendAccountRequestConfirmation } from "./email-service.js";

const EMAIL_VERIFICATION_DURATION_MS = 1000 * 60 * 60 * 24 * 7;

function getPublicUrl() {
  return String(
    process.env.PUBLIC_URL || process.env.FRONTEND_ORIGIN || process.env.CORS_ORIGIN || ""
  ).split(",")[0].trim().replace(/\/$/, "");
}

function buildEmailVerificationUrl(rawToken) {
  const publicUrl = getPublicUrl();
  return publicUrl ? `${publicUrl}/api/auth/verify-email?token=${encodeURIComponent(rawToken)}` : "";
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

/**
 * Cherche une association automatique selon la règle fonctionnelle ClimbCrew :
 * 1. adresse e-mail identique ;
 * 2. à défaut, prénom ET nom identiques.
 *
 * Les comparaisons ignorent la casse et les espaces de début/fin. Une
 * correspondance ambiguë ou un profil déjà lié à un autre compte n'est jamais
 * choisie automatiquement : l'administrateur devra alors décider manuellement.
 */
export async function findAutomaticParticipantMatch(client, {
  email,
  prenom,
  nom,
  userId = null,
}) {
  const normalizedEmail = cleanEmail(email);
  const normalizedPrenom = String(prenom || "").trim();
  const normalizedNom = String(nom || "").trim();

  if (normalizedEmail) {
    const emailMatches = await client.query(
      `
        select p.id,
               exists(
                 select 1
                 from users u
                 where u.participant_id = p.id
                   and ($2::bigint is null or u.id <> $2::bigint)
               ) as already_linked
        from participants p
        where lower(trim(coalesce(p.login_email, p.email, ''))) = $1
        order by p.id asc
        limit 3
      `,
      [normalizedEmail, userId]
    );

    if (emailMatches.rowCount === 1 && !emailMatches.rows[0].already_linked) {
      return { participantId: String(emailMatches.rows[0].id), matchingKey: "email", issue: null };
    }
    if (emailMatches.rowCount > 1) {
      return { participantId: null, matchingKey: null, issue: "email_ambiguous" };
    }
    if (emailMatches.rowCount === 1 && emailMatches.rows[0].already_linked) {
      return { participantId: null, matchingKey: null, issue: "email_already_linked" };
    }
  }

  if (normalizedPrenom && normalizedNom) {
    const nameMatches = await client.query(
      `
        select p.id,
               exists(
                 select 1
                 from users u
                 where u.participant_id = p.id
                   and ($3::bigint is null or u.id <> $3::bigint)
               ) as already_linked
        from participants p
        where lower(trim(p.prenom)) = lower(trim($1))
          and lower(trim(p.nom)) = lower(trim($2))
        order by p.id asc
        limit 3
      `,
      [normalizedPrenom, normalizedNom, userId]
    );

    if (nameMatches.rowCount === 1 && !nameMatches.rows[0].already_linked) {
      return { participantId: String(nameMatches.rows[0].id), matchingKey: "name", issue: null };
    }
    if (nameMatches.rowCount > 1) {
      return { participantId: null, matchingKey: null, issue: "name_ambiguous" };
    }
    if (nameMatches.rowCount === 1 && nameMatches.rows[0].already_linked) {
      return { participantId: null, matchingKey: null, issue: "name_already_linked" };
    }
  }

  return { participantId: null, matchingKey: null, issue: "not_found" };
}

async function synchronizeLinkedParticipant(client, participantId, user) {
  if (!participantId) return;
  await client.query(
    `
      update participants
      set login_email = $2,
          can_admin = $3
      where id = $1
    `,
    [participantId, cleanEmail(user.email), Boolean(user.role === "admin" || user.is_admin)]
  );
}

/**
 * Contrôleur de création de compte avec association automatique sans création
 * artificielle de fiche grimpeur. Si aucune correspondance sûre n'existe, le
 * compte est créé sans participant_id et pourra être associé par un admin.
 */
export async function requestAccessWithAssociations(req, res) {
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

    const match = await findAutomaticParticipantMatch(client, { email, prenom, nom });
    const participantId = match.participantId || null;
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
    if (participantId) {
      await synchronizeLinkedParticipant(client, participantId, user);
    }

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
      details: {
        email,
        participantId: participantId ? String(participantId) : null,
        participantCreated: false,
        matchingKey: match.matchingKey,
        associationIssue: match.issue,
      },
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
      participantCreated: false,
      association: {
        participantId: participantId ? String(participantId) : null,
        matchingKey: match.matchingKey,
        issue: match.issue,
      },
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
 * Lance le rattrapage sur tous les comptes sans fiche grimpeur. Les associations
 * déjà existantes, y compris celles faites manuellement, ne sont jamais écrasées.
 */
export async function associateExistingAccounts(req, res) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const usersResult = await client.query(
      `
        select id, participant_id, email, prenom, nom, role, is_admin
        from users
        where participant_id is null
        order by id asc
        for update
      `
    );

    const summary = {
      associatedCount: 0,
      byEmail: 0,
      byName: 0,
      ambiguousCount: 0,
      unavailableCount: 0,
      unmatchedCount: 0,
      associatedUserIds: [],
    };

    for (const user of usersResult.rows) {
      const match = await findAutomaticParticipantMatch(client, {
        email: user.email,
        prenom: user.prenom,
        nom: user.nom,
        userId: user.id,
      });

      if (!match.participantId) {
        if (["email_ambiguous", "name_ambiguous"].includes(match.issue)) summary.ambiguousCount += 1;
        else if (["email_already_linked", "name_already_linked"].includes(match.issue)) summary.unavailableCount += 1;
        else summary.unmatchedCount += 1;
        continue;
      }

      const updated = await client.query(
        `update users set participant_id = $2 where id = $1 and participant_id is null returning *`,
        [user.id, match.participantId]
      );
      if (!updated.rowCount) continue;

      await synchronizeLinkedParticipant(client, match.participantId, updated.rows[0]);
      summary.associatedCount += 1;
      summary.associatedUserIds.push(String(user.id));
      if (match.matchingKey === "email") summary.byEmail += 1;
      if (match.matchingKey === "name") summary.byName += 1;
    }

    await client.query("commit");

    await writeAccessLog({
      userId: req.enhancementAuth.user.id,
      eventType: "account_associations_auto_run",
      req,
      details: summary,
    });

    res.json({ ok: true, ...summary });
  } catch (error) {
    await client.query("rollback");
    res.status(500).json({ error: String(error.message || error) });
  } finally {
    client.release();
  }
}

/** Associe ou dissocie manuellement un compte et une fiche grimpeur. */
export async function setUserParticipantAssociation(req, res) {
  const userId = Number(req.params.id);
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

    const previousParticipantId = user.participant_id ? Number(user.participant_id) : null;

    if (participantId !== null) {
      const participantResult = await client.query(`select id from participants where id = $1 for update`, [participantId]);
      if (!participantResult.rowCount) {
        await client.query("rollback");
        return res.status(404).json({ error: "Fiche grimpeur introuvable" });
      }

      const conflict = await client.query(
        `select id, email from users where participant_id = $1 and id <> $2 limit 1`,
        [participantId, userId]
      );
      if (conflict.rowCount) {
        await client.query("rollback");
        return res.status(409).json({ error: "Cette fiche grimpeur est déjà associée à un autre compte" });
      }
    }

    const updatedResult = await client.query(
      `update users set participant_id = $2 where id = $1 returning *`,
      [userId, participantId]
    );
    const updatedUser = updatedResult.rows[0];

    if (previousParticipantId && previousParticipantId !== participantId) {
      await client.query(`update participants set can_admin = false where id = $1`, [previousParticipantId]);
    }
    if (participantId) {
      await synchronizeLinkedParticipant(client, participantId, updatedUser);
    }

    await client.query("commit");

    await writeAccessLog({
      userId,
      eventType: participantId ? "account_participant_associated" : "account_participant_dissociated",
      req,
      details: {
        participantId: participantId ? String(participantId) : null,
        previousParticipantId: previousParticipantId ? String(previousParticipantId) : null,
        changedBy: req.enhancementAuth.user.email,
      },
    });

    res.json({ ok: true, user: serializeUser(updatedUser) });
  } catch (error) {
    await client.query("rollback");
    res.status(500).json({ error: String(error.message || error) });
  } finally {
    client.release();
  }
}
