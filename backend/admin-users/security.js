import crypto from "node:crypto";

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
