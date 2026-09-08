export const PASSWORD_RULE_TEXT = "8 caractères minimum, dont 1 majuscule, 1 minuscule, 1 chiffre et 1 caractère spécial.";

export function isStrongPassword(value) {
  return typeof value === "string"
    && value.length >= 8
    && /[a-z]/.test(value)
    && /[A-Z]/.test(value)
    && /\d/.test(value)
    && /[^A-Za-z0-9]/.test(value);
}
