import { getPool } from "./database.js";
import { writeAccessLog } from "./access-log-service.js";
import { hashToken } from "./security.js";
import { serializeUser } from "./user-serializer.js";
import { notifyAccountRequestReviewers } from "./account-notification-preference-service.js";
import { sendApprovalNotificationEmail } from "./account-service.js";

/**
 * Valide la propriété de l'adresse e-mail sans activer automatiquement le compte.
 * L'association à une fiche grimpeur puis l'approbation restent des actions
 * administrateur explicites.
 */
export async function verifyEmailPendingAdminApproval(req, res) {
  const rawToken = String(req.query?.token || req.body?.token || "").trim();
  if (!rawToken) return res.status(400).send("Lien de confirmation invalide.");

  let client = null;
  let transactionStarted = false;
  let transactionCommitted = false;
  let stage = "verification.request_received";
  let userId = null;

  const setStage = (nextStage) => {
    stage = nextStage;
    req.requestDiagnosticStage = `verify_email.${nextStage}`;
  };

  const logVerificationError = (error) => {
    console.error("Erreur pendant la confirmation e-mail :", error);
  };

  try {
    setStage("token_hash");
    const tokenHash = hashToken(rawToken);

    setStage("database_connect");
    client = await getPool().connect();

    setStage("transaction_begin");
    await client.query("begin");
    transactionStarted = true;

    setStage("token_lookup");
    const tokenResult = await client.query(
      `
        select evt.id, evt.user_id, evt.expires_at, evt.used_at,
               u.email, u.prenom, u.nom, u.status,
               u.email_verified_at, u.participant_id, u.is_admin
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
      setStage("token_not_found");
      await client.query("rollback");
      transactionStarted = false;
      return res.status(404).send("Ce lien de confirmation est introuvable ou a déjà été supprimé.");
    }
    userId = tokenRow.user_id;
    setStage("token_found");

    if (tokenRow.used_at) {
      setStage("token_already_used");
      await client.query("rollback");
      transactionStarted = false;
      if (tokenRow.status === "active") {
        return res.status(200).send("Cette adresse e-mail a déjà été confirmée et le compte est actif.");
      }
      return res.status(200).send(
        "Cette adresse e-mail a déjà été confirmée. Le compte reste en attente d’association et d’approbation par un administrateur.",
      );
    }

    const expiresAt = new Date(tokenRow.expires_at).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      setStage("token_expired");
      await client.query("rollback");
      transactionStarted = false;
      return res.status(410).send("Ce lien de confirmation a expiré.");
    }

    setStage("token_mark_used");
    await client.query(
      "update email_verification_tokens set used_at = now() where id = $1 and used_at is null",
      [tokenRow.id],
    );

    setStage("user_mark_verified");
    const verifiedUserResult = await client.query(
      `
        update users
        set email_verified_at = coalesce(email_verified_at, now())
        where id = $1
        returning id, participant_id, email, prenom, nom, is_admin,
                  status, email_verified_at
      `,
      [tokenRow.user_id],
    );

    const verifiedUser = verifiedUserResult.rows[0];
    if (!verifiedUser) {
      throw new Error(`Utilisateur introuvable pendant la confirmation (id=${tokenRow.user_id})`);
    }

    setStage("transaction_commit");
    await client.query("commit");
    transactionStarted = false;
    transactionCommitted = true;
    setStage("database_committed");

    // Les opérations de journalisation et de notification ne doivent jamais
    // transformer une confirmation déjà validée en erreur HTTP 500.
    try {
      setStage("access_log_write");
      await writeAccessLog({
        userId: verifiedUser.id,
        eventType: "account_request_email_verified",
        req,
        details: {
          email: verifiedUser.email,
          status: verifiedUser.status,
          autoActivated: false,
          awaitingAdminApproval: verifiedUser.status === "pending",
          participantId: verifiedUser.participant_id ? String(verifiedUser.participant_id) : null,
          isAdmin: Boolean(verifiedUser.is_admin),
        },
      });
    } catch (loggingError) {
      logVerificationError(loggingError);
    }

    if (verifiedUser.status === "pending") {
      try {
        setStage("admin_notification");
        await notifyAccountRequestReviewers({ user: verifiedUser, req });
      } catch (notificationError) {
        logVerificationError(notificationError);
      }
    }

    setStage("completed");
    if (verifiedUser.status === "pending") {
      return res.status(200).send(
        "Adresse e-mail confirmée. Un administrateur doit maintenant associer le compte à une fiche grimpeur puis l’approuver.",
      );
    }
    return res.status(200).send("Adresse e-mail confirmée.");
  } catch (error) {
    if (client && transactionStarted && !transactionCommitted) {
      await client.query("rollback").catch(() => undefined);
      transactionStarted = false;
    }
    logVerificationError(error);
    await writeAccessLog({
      userId,
      eventType: "account_request_email_verification_failed",
      success: false,
      req,
      details: {
        requestId: req.requestId || null,
        stage,
        code: error?.code || null,
        error: String(error?.message || error),
      },
    });
    return res.status(500).send("La confirmation de l’adresse e-mail a échoué.");
  } finally {
    client?.release();
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
