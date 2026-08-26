import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import {
  BCRYPT_ROUNDS,
  CSRF_COOKIE_NAME,
  RESET_TOKEN_DURATION_MS,
  SESSION_COOKIE_NAME,
} from "./config.js";
import { getPool } from "./database.js";
import { writeAccessLog } from "./access-log-service.js";
import { cleanEmail, hashToken, isStrongPassword } from "./security.js";
import { serializeUser } from "./user-serializer.js";
import { sendPasswordResetCode } from "./email-service.js";

const IS_PRODUCTION = process.env.NODE_ENV === "production";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * Number(process.env.SESSION_DURATION_DAYS || 7);
const configuredSameSite = String(process.env.COOKIE_SAMESITE || "lax").toLowerCase();
const COOKIE_SAMESITE = ["lax", "strict", "none"].includes(configuredSameSite) ? configuredSameSite : "lax";
const SECURE_COOKIES = String(process.env.SECURE_COOKIES || (IS_PRODUCTION ? "true" : "false")).toLowerCase() === "true";

export const RESET_CODE_BYTES = 8;
export const RESET_CODE_HEX_LENGTH = RESET_CODE_BYTES * 2;

const dummyPasswordHashPromise = bcrypt.hash(
  crypto.randomBytes(32).toString("hex"),
  BCRYPT_ROUNDS,
);

function nowPlus(ms) {
  return new Date(Date.now() + ms).toISOString();
}

function randomToken(size = 24) {
  return crypto.randomBytes(size).toString("hex");
}

export function createResetCode() {
  return crypto.randomBytes(RESET_CODE_BYTES).toString("hex").toUpperCase();
}

function setSessionCookie(res, rawToken, expiresAt) {
  res.cookie(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: SECURE_COOKIES,
    sameSite: COOKIE_SAMESITE,
    expires: new Date(expiresAt),
    path: "/",
  });
}

function setCsrfCookie(res, rawToken, expiresAt) {
  res.cookie(CSRF_COOKIE_NAME, rawToken, {
    httpOnly: false,
    secure: SECURE_COOKIES,
    sameSite: COOKIE_SAMESITE,
    expires: new Date(expiresAt),
    path: "/",
  });
}

function clientIp(req) {
  return String(req?.ip || req?.socket?.remoteAddress || "").trim() || null;
}

/**
 * Connexion sans fuite d'existence de compte : un e-mail inconnu et un mauvais
 * mot de passe suivent tous deux une comparaison bcrypt avant la même réponse.
 */
export async function secureLogin(req, res) {
  const email = cleanEmail(req.body?.email);
  const password = String(req.body?.password || "");

  try {
    // climbcrew_normalize_email traite "prenom.nom@gmail.com" et
    // "prenomnom@gmail.com" comme la même boîte (Gmail ignore les points et
    // tout ce qui suit un "+"). La détection de doublon à l'inscription
    // empêche désormais de créer un second compte pour la même adresse
    // réelle, mais un compte dupliqué avant ce correctif peut encore exister :
    // on essaie donc chaque candidat plutôt que d'en tirer un seul au hasard.
    const result = await getPool().query(
      `select * from users where climbcrew_normalize_email(email) = climbcrew_normalize_email($1)`,
      [email],
    );

    let user = null;
    if (result.rows.length) {
      for (const candidate of result.rows) {
        if (await bcrypt.compare(password, candidate.password_hash)) {
          user = candidate;
          break;
        }
      }
    } else {
      await bcrypt.compare(password, await dummyPasswordHashPromise);
    }
    const passwordMatches = Boolean(user);

    if (!user || !passwordMatches) {
      await writeAccessLog({
        userId: user?.id || null,
        eventType: "login_failed",
        success: false,
        req,
        details: { reason: "invalid_credentials" },
      });
      return res.status(401).json({ error: "Identifiants invalides" });
    }

    if (user.status !== "active") {
      await writeAccessLog({
        userId: user.id,
        eventType: "login_blocked",
        success: false,
        req,
        details: { status: user.status },
      });
      return res.status(403).json({ error: `Compte ${user.status}` });
    }

    const rawToken = randomToken(32);
    const csrfToken = randomToken(24);
    const expiresAt = nowPlus(SESSION_DURATION_MS);

    await getPool().query(
      `insert into user_sessions (user_id, token_hash, expires_at, user_agent, ip_address)
       values ($1, $2, $3, $4, $5)`,
      [user.id, hashToken(rawToken), expiresAt, req.headers["user-agent"] || null, clientIp(req)],
    );

    const updatedUserResult = await getPool().query(
      `update users set last_login_at = now() where id = $1 returning *`,
      [user.id],
    );

    await writeAccessLog({
      userId: user.id,
      eventType: "login_success",
      success: true,
      req,
      details: {},
    });

    setSessionCookie(res, rawToken, expiresAt);
    setCsrfCookie(res, csrfToken, expiresAt);

    return res.json({ ok: true, user: serializeUser(updatedUserResult.rows[0]) });
  } catch (error) {
    console.error("Connexion impossible :", error);
    return res.status(500).json({ error: "Connexion momentanément impossible" });
  }
}

/** Réponse volontairement identique qu'une adresse existe ou non. */
export async function secureForgotPassword(req, res) {
  const email = cleanEmail(req.body?.email);
  const genericMessage = "Si un compte actif correspond à cette adresse, un code de réinitialisation valable une heure a été envoyé par e-mail. Vérifie également les courriers indésirables.";

  if (!email) return res.status(400).json({ error: "Email requis" });

  try {
    const userResult = await getPool().query(
      `select id, email, prenom, nom, status from users where lower(email) = $1 limit 1`,
      [email],
    );
    const user = userResult.rows[0] || null;

    await writeAccessLog({
      userId: user?.id || null,
      eventType: "forgot_password_requested",
      req,
      details: { accountMatched: Boolean(user) },
    });

    if (!user || user.status !== "active") {
      return res.json({ ok: true, message: genericMessage });
    }

    const resetCode = createResetCode();
    const expiresAt = nowPlus(RESET_TOKEN_DURATION_MS);
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query("begin");
      await client.query(
        `update password_reset_tokens set used_at = now() where user_id = $1 and used_at is null`,
        [user.id],
      );
      await client.query(
        `insert into password_reset_tokens (user_id, token_hash, expires_at) values ($1, $2, $3)`,
        [user.id, hashToken(resetCode), expiresAt],
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
          `update password_reset_tokens set used_at = now()
           where user_id = $1 and token_hash = $2 and used_at is null`,
          [user.id, hashToken(resetCode)],
        );
      }

      await writeAccessLog({
        userId: user.id,
        eventType: emailResult.sent ? "password_reset_email_sent" : "password_reset_email_skipped",
        success: Boolean(emailResult.sent),
        req,
        details: { delivered: Boolean(emailResult.sent), expiresAt },
      });
    } catch (error) {
      await pool.query(
        `update password_reset_tokens set used_at = now()
         where user_id = $1 and token_hash = $2 and used_at is null`,
        [user.id, hashToken(resetCode)],
      );
      console.error("Envoi du code de réinitialisation impossible :", error);
      await writeAccessLog({
        userId: user.id,
        eventType: "password_reset_email_failed",
        success: false,
        req,
        details: { expiresAt },
      });
    }

    return res.json({ ok: true, message: genericMessage });
  } catch (error) {
    console.error("Traitement mot de passe perdu impossible :", error);
    return res.status(500).json({ error: "La demande de réinitialisation ne peut pas être traitée pour le moment" });
  }
}

/**
 * Réinitialise le mot de passe sans permettre de déduire si l'adresse existe :
 * e-mail inconnu et code invalide renvoient la même réponse fonctionnelle.
 */
export async function secureResetPassword(req, res) {
  const email = cleanEmail(req.body?.email);
  const rawToken = String(req.body?.token || "").trim();
  const password = String(req.body?.password || "");
  const invalidResetMessage = "Code de réinitialisation invalide ou expiré";

  if (!email || !rawToken || !password) {
    return res.status(400).json({ error: "Email, code et nouveau mot de passe sont requis" });
  }
  if (!isStrongPassword(password)) {
    return res.status(400).json({
      error: "Le mot de passe doit contenir 8 caractères minimum, dont 1 majuscule, 1 minuscule, 1 chiffre et 1 caractère spécial",
    });
  }

  const client = await getPool().connect();
  try {
    await client.query("begin");
    const userResult = await client.query(
      `select * from users where lower(email) = $1 limit 1`,
      [email],
    );
    const user = userResult.rows[0] || null;

    if (!user) {
      await client.query("rollback");
      return res.status(400).json({ error: invalidResetMessage });
    }

    const tokenResult = await client.query(
      `select * from password_reset_tokens
       where user_id = $1 and token_hash = $2 and used_at is null and expires_at > now()
       limit 1`,
      [user.id, hashToken(rawToken)],
    );
    const resetToken = tokenResult.rows[0] || null;

    if (!resetToken) {
      await client.query("rollback");
      return res.status(400).json({ error: invalidResetMessage });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await client.query(
      `update users set password_hash = $2, must_reset_password = false where id = $1`,
      [user.id, passwordHash],
    );
    await client.query(
      `update password_reset_tokens set used_at = now() where user_id = $1 and used_at is null`,
      [user.id],
    );
    await client.query(
      `update user_sessions set revoked_at = now() where user_id = $1 and revoked_at is null`,
      [user.id],
    );
    await client.query("commit");

    await writeAccessLog({
      userId: user.id,
      eventType: "password_reset_completed",
      success: true,
      req,
      details: {},
    });

    return res.json({ ok: true, message: "Mot de passe réinitialisé. Tu peux te reconnecter." });
  } catch (error) {
    await client.query("rollback");
    console.error("Réinitialisation du mot de passe impossible :", error);
    return res.status(500).json({ error: "Réinitialisation momentanément impossible" });
  } finally {
    client.release();
  }
}

/** Génère un code administrateur avec la même entropie que le parcours e-mail. */
export async function secureAdminResetToken(req, res) {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: "Utilisateur invalide" });
  }

  try {
    const userResult = await getPool().query(
      `select id from users where id = $1`,
      [userId],
    );
    if (!userResult.rowCount) return res.status(404).json({ error: "Compte introuvable" });

    const rawToken = createResetCode();
    const expiresAt = nowPlus(RESET_TOKEN_DURATION_MS);
    const client = await getPool().connect();
    try {
      await client.query("begin");
      await client.query(
        `update password_reset_tokens set used_at = now() where user_id = $1 and used_at is null`,
        [userId],
      );
      await client.query(
        `insert into password_reset_tokens (user_id, token_hash, expires_at) values ($1, $2, $3)`,
        [userId, hashToken(rawToken), expiresAt],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }

    await writeAccessLog({
      userId,
      eventType: "password_reset_token_generated",
      success: true,
      req,
      details: { expiresAt },
    });

    return res.json({ ok: true, resetToken: rawToken, expiresAt });
  } catch (error) {
    console.error("Génération du code de réinitialisation impossible :", error);
    return res.status(500).json({ error: "Génération du code impossible" });
  }
}
