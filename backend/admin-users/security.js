import crypto from "node:crypto";
import { CSRF_COOKIE_NAME, SESSION_COOKIE_NAME } from "./config.js";
import { getPool } from "./database.js";

/** Décode un cookie sans laisser une séquence d'échappement invalide faire échouer la requête. */
function safeDecodeCookie(value = "") {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return String(value || "");
  }
}

/** Transforme l'en-tête Cookie en objet clé/valeur. */
export function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        if (separator < 0) return [part, ""];
        return [part.slice(0, separator), safeDecodeCookie(part.slice(separator + 1))];
      })
  );
}

/** Comparaison résistante aux attaques temporelles. */
export function constantTimeEqual(leftValue, rightValue) {
  const left = Buffer.from(String(leftValue || ""));
  const right = Buffer.from(String(rightValue || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/** Accepte le cookie HttpOnly principal et l'ancien Bearer token. */
export function getSessionToken(req) {
  const match = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  return match?.[1] || parseCookies(req)[SESSION_COOKIE_NAME] || "";
}

export function hashToken(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

export function cleanEmail(value) {
  return String(value || "").trim().toLowerCase();
}

/**
 * Clé de comparaison d'identité par e-mail, alignée sur climbcrew_normalize_email
 * (migration 004) : Gmail ignore les points et tout ce qui suit un "+" dans la
 * partie locale. Utilisée uniquement pour détecter des doublons en mémoire
 * (ex. préflight d'import) ; les comparaisons en base passent par la fonction
 * SQL équivalente pour rester la source de vérité unique.
 */
export function emailMatchKey(value) {
  const cleaned = cleanEmail(value);
  const atIndex = cleaned.indexOf("@");
  if (atIndex === -1) return cleaned;

  const localPart = cleaned.slice(0, atIndex);
  const domainPart = cleaned.slice(atIndex + 1);
  if (domainPart !== "gmail.com" && domainPart !== "googlemail.com") {
    return cleaned;
  }

  const withoutAlias = localPart.split("+")[0];
  return `${withoutAlias.replaceAll(".", "")}@gmail.com`;
}

/**
 * bcrypt ne prend en compte que les 72 premiers octets du mot de passe.
 * Refuser explicitement les valeurs plus longues évite que deux chaînes
 * différentes deviennent équivalentes après troncature implicite.
 */
export function isStrongPassword(value) {
  return typeof value === "string"
    && Buffer.byteLength(value, "utf8") <= 72
    && value.length >= 8
    && /[a-z]/.test(value)
    && /[A-Z]/.test(value)
    && /\d/.test(value)
    && /[^A-Za-z0-9]/.test(value);
}

/** Recharge l'utilisateur à chaque requête pour appliquer immédiatement un changement de rôle. */
export async function loadAuthenticatedUser(req) {
  const rawToken = getSessionToken(req);
  if (!rawToken) return null;

  const result = await getPool().query(
    `
      select u.*, us.id as session_id
      from user_sessions us
      join users u on u.id = us.user_id
      where us.token_hash = $1
        and us.revoked_at is null
        and us.expires_at > now()
        and u.status = 'active'
      limit 1
    `,
    [hashToken(rawToken)]
  );

  return result.rows[0] || null;
}

/**
 * Middleware d'authentification pour les routes en libre-service (paramètres
 * du compte) ajoutées par ce module : n'importe quel compte actif, sans
 * exigence de rôle administrateur.
 */
export async function requireAuthUser(req, res, next) {
  try {
    const user = await loadAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: "Authentification requise" });

    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const csrfCookie = parseCookies(req)[CSRF_COOKIE_NAME];
      const csrfHeader = req.headers["x-csrf-token"];
      if (!csrfCookie || !csrfHeader || !constantTimeEqual(csrfCookie, csrfHeader)) {
        return res.status(403).json({ error: "Protection CSRF : jeton absent ou invalide" });
      }
    }

    req.enhancementAuth = { user };
    next();
  } catch (error) {
    console.error("Vérification de l'authentification :", error);
    res.status(500).json({ error: "Erreur de vérification de l'authentification" });
  }
}

/** Middleware réservé aux routes ajoutées par le module. */
export async function requireAdmin(req, res, next) {
  try {
    const user = await loadAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: "Authentification requise" });
    if (!(user.role === "admin" || user.is_admin)) {
      return res.status(403).json({ error: "Accès administrateur requis" });
    }

    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const csrfCookie = parseCookies(req)[CSRF_COOKIE_NAME];
      const csrfHeader = req.headers["x-csrf-token"];
      if (!csrfCookie || !csrfHeader || !constantTimeEqual(csrfCookie, csrfHeader)) {
        return res.status(403).json({ error: "Protection CSRF : jeton absent ou invalide" });
      }
    }

    req.enhancementAuth = { user };
    next();
  } catch (error) {
    console.error("Vérification des droits administrateur :", error);
    res.status(500).json({ error: "Erreur de vérification des droits administrateur" });
  }
}
