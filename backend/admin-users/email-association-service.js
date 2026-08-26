import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { BCRYPT_ROUNDS, REQUIRE_ADMIN_ACCOUNT_APPROVAL } from "./config.js";
import { getPool } from "./database.js";
import { writeAccessLog } from "./access-log-service.js";
import { cleanEmail, hashToken, isStrongPassword } from "./security.js";
import { sendAccountRequestConfirmation } from "./email-service.js";

const EMAIL_VERIFICATION_DURATION_MS = 1000 * 60 * 60 * 24 * 7;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PUBLIC_REQUEST_MESSAGE = REQUIRE_ADMIN_ACCOUNT_APPROVAL
  ? "Si cette adresse peut être utilisée pour un compte ClimbCrew, un e-mail de confirmation sera envoyé. Après confirmation, un administrateur devra associer puis approuver le compte si nécessaire."
  : "Si cette adresse peut être utilisée pour un compte ClimbCrew, un e-mail de confirmation sera envoyé. Après confirmation de l’adresse e-mail, le compte sera activé automatiquement.";

function getPublicUrl() {
  return String(
    process.env.PUBLIC_URL || process.env.FRONTEND_ORIGIN || process.env.CORS_ORIGIN || "",
  ).split(",")[0].trim().replace(/\/$/, "");
}

function buildEmailVerificationUrl(rawToken) {
  const publicUrl = getPublicUrl();
  return publicUrl
    ? `${publicUrl}/api/auth/verify-email?token=${encodeURIComponent(rawToken)}`
    : "";
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

function validatePublicRequestIdentity({ prenom, nom, email }) {
  if (!prenom || !nom || !email) {
    return "Prénom, nom et email sont requis";
  }
  if (prenom.length > 120 || nom.length > 120) {
    return "Le prénom et le nom sont limités à 120 caractères";
  }
  if (email.length > 320 || !EMAIL_PATTERN.test(email)) {
    return "Adresse e-mail invalide";
  }
  return "";
}

function publicRequestResponse(res) {
  return res.json({ ok: true, message: PUBLIC_REQUEST_MESSAGE });
}

/**
 * Cherche une fiche grimpeur uniquement par l'adresse e-mail canonique.
 * Le prénom et le nom ne sont jamais utilisés comme clé automatique : ils sont
 * trop ambigus pour établir une relation d'identité entre un compte et une fiche.
 */
export async function findParticipantByEmailOnly(client, { email, userId = null }) {
  const normalizedEmail = cleanEmail(email);
  if (!normalizedEmail) {
    return { participantId: null, matchingKey: null, issue: "email_missing" };
  }

  const matches = await client.query(
    `
      select p.id,
             exists(
               select 1
               from users u
               where u.participant_id = p.id
                 and ($2::bigint is null or u.id <> $2::bigint)
             ) as already_linked
      from participants p
      where climbcrew_normalize_email(coalesce(nullif(trim(p.login_email), ''), nullif(trim(p.email), ''), ''))
            = climbcrew_normalize_email($1)
      order by p.id asc
      limit 3
    `,
    [normalizedEmail, userId],
  );

  if (matches.rowCount === 1 && !matches.rows[0].already_linked) {
    return {
      participantId: String(matches.rows[0].id),
      matchingKey: "email",
      issue: null,
    };
  }
  if (matches.rowCount > 1) {
    return { participantId: null, matchingKey: null, issue: "email_ambiguous" };
  }
  if (matches.rowCount === 1 && matches.rows[0].already_linked) {
    return { participantId: null, matchingKey: null, issue: "email_already_linked" };
  }
  return { participantId: null, matchingKey: null, issue: "email_not_found" };
}

/**
 * Création de compte avec association automatique exclusivement par e-mail.
 *
 * Une demande non vérifiée ne crée jamais de nouvelle fiche participant. Si une
 * fiche portant déjà exactement l'adresse existe, le compte pending peut y être
 * associé ; sinon la création de la fiche minimale est différée jusqu'au clic
 * sur le lien de confirmation e-mail.
 *
 * La réponse publique reste volontairement identique qu'un compte ou une fiche
 * existe déjà ou non afin d'empêcher l'énumération des membres du club.
 */
export async function requestAccessByEmailOnly(req, res) {
  const prenom = String(req.body?.prenom || "").trim();
  const nom = String(req.body?.nom || "").trim();
  const email = cleanEmail(req.body?.email);
  const password = String(req.body?.password || "");
  const acceptTerms = Boolean(req.body?.acceptTerms);

  const identityError = validatePublicRequestIdentity({ prenom, nom, email });
  if (identityError) return res.status(400).json({ error: identityError });
  if (!acceptTerms) {
    return res.status(400).json({ error: "Les conditions d’utilisation doivent être acceptées" });
  }
  if (!isStrongPassword(password)) {
    return res.status(400).json({
      error: "Le mot de passe doit contenir entre 8 caractères et 72 octets, dont 1 majuscule, 1 minuscule, 1 chiffre et 1 caractère spécial",
    });
  }

  const client = await getPool().connect();
  try {
    await client.query("begin");

    const existing = await client.query(
      `select id from users where climbcrew_normalize_email(email) = climbcrew_normalize_email($1) limit 1`,
      [email],
    );
    if (existing.rowCount) {
      await client.query("rollback");
      await writeAccessLog({
        userId: existing.rows[0].id,
        eventType: "request_access_existing_email",
        success: false,
        req,
        details: { reason: "existing_account" },
      });
      return publicRequestResponse(res);
    }

    // L'association à une fiche grimpeur est volontairement différée jusqu'à
    // la confirmation de l'adresse e-mail (voir verifyEmailPendingAdminApproval) :
    // associer dès l'inscription permettait à un compte jamais vérifié de
    // verrouiller indéfiniment une fiche, sans qu'un administrateur ne puisse
    // même le voir pour le corriger.
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const verificationToken = crypto.randomBytes(24).toString("hex");
    const verificationTokenHash = hashToken(verificationToken);
    const verificationExpiresAt = new Date(
      Date.now() + EMAIL_VERIFICATION_DURATION_MS,
    ).toISOString();

    const userResult = await client.query(
      `
        insert into users (
          participant_id, email, prenom, nom, password_hash,
          role, is_admin, status
        ) values (null, $1, $2, $3, $4, 'user', false, 'pending')
        returning *
      `,
      [email, prenom, nom, passwordHash],
    );
    const user = userResult.rows[0];

    await client.query(
      `
        insert into email_verification_tokens (user_id, token_hash, expires_at)
        values ($1, $2, $3)
      `,
      [user.id, verificationTokenHash, verificationExpiresAt],
    );

    await client.query("commit");

    await writeAccessLog({
      userId: user.id,
      eventType: "request_access",
      req,
      details: {
        email,
        participantId: null,
        associationDeferredUntilEmailVerified: true,
        requiresAdminApproval: REQUIRE_ADMIN_ACCOUNT_APPROVAL,
      },
    });

    try {
      const emailResult = await sendAccountRequestConfirmation({
        email,
        prenom,
        nom,
        verificationUrl: buildEmailVerificationUrl(verificationToken),
      });
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

    return publicRequestResponse(res);
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    console.error("Création de compte impossible :", error);
    return res.status(500).json({ error: "Création de compte momentanément impossible" });
  } finally {
    client.release();
  }
}

/**
 * Rattrapage des comptes existants : même règle stricte, e-mail uniquement.
 * Le champ `byName` reste présent à 0 pour ne pas casser l'interface existante.
 */
export async function associateExistingAccountsByEmail(req, res) {
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
      `,
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
      const match = await findParticipantByEmailOnly(client, {
        email: user.email,
        userId: user.id,
      });

      if (!match.participantId) {
        if (match.issue === "email_ambiguous") summary.ambiguousCount += 1;
        else if (match.issue === "email_already_linked") summary.unavailableCount += 1;
        else summary.unmatchedCount += 1;
        continue;
      }

      await client.query(
        `update users set participant_id = $2 where id = $1`,
        [user.id, match.participantId],
      );
      await client.query(
        `update participants set login_email = $2 where id = $1`,
        [match.participantId, cleanEmail(user.email)],
      );

      summary.associatedCount += 1;
      summary.byEmail += 1;
      summary.associatedUserIds.push(String(user.id));
    }

    await client.query("commit");

    await writeAccessLog({
      userId: req.auth?.user?.id || req.enhancementAuth?.user?.id || null,
      eventType: "account_associations_auto",
      success: true,
      req,
      details: summary,
    });

    return res.json({ ok: true, ...summary });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    console.error("Association automatique des comptes impossible :", error);
    return res.status(500).json({ error: "Association automatique impossible" });
  } finally {
    client.release();
  }
}
