import { cleanEmail } from "../security/runtime-helpers.js";

export {
  cleanEmail,
  constantTimeEqual,
  hashToken,
  isStrongPassword,
  parseCookies,
} from "../security/runtime-helpers.js";

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
