export const PASSPORT_OPTIONS = [
  { value: "sans", label: "Gris clair" },
  { value: "jaune", label: "Jaune" },
  { value: "orange", label: "Orange" },
  { value: "bleu", label: "Bleu" },
  { value: "vert", label: "Vert" },
];

export const PASSPORT_VALUES = PASSPORT_OPTIONS.map(({ value }) => value);

const PASSPORT_LABELS = Object.fromEntries(
  PASSPORT_OPTIONS.map(({ value, label }) => [value, label]),
);

const LIBRE_ELIGIBLE_COLORS = new Set(["jaune", "orange", "vert", "bleu"]);
const LEGACY_DISCOVERY_VALUES = new Set(["decouverte", "decouvertes"]);

export function normalizePassport(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function resolvePassportSelection(value, passportDecouverte = false) {
  const normalized = normalizePassport(value);
  const legacyDiscovery = LEGACY_DISCOVERY_VALUES.has(normalized) || normalized.endsWith("_d");
  let passport = normalized;

  if (!passport || passport === "sans" || passport === "gris" || LEGACY_DISCOVERY_VALUES.has(passport)) {
    passport = "sans";
  } else if (passport.endsWith("_d")) {
    passport = passport.slice(0, -2);
  }

  return {
    passport,
    passportDecouverte: Boolean(passportDecouverte) || legacyDiscovery,
  };
}

export function getPassportColor(value) {
  return resolvePassportSelection(value).passport;
}

export function hasPassportDiscoveryMark(value, passportDecouverte = false) {
  return resolvePassportSelection(value, passportDecouverte).passportDecouverte;
}

export function isLibreEligiblePassport(value) {
  return LIBRE_ELIGIBLE_COLORS.has(getPassportColor(value));
}

export function formatPassportLabel(value) {
  const passport = getPassportColor(value);
  return PASSPORT_LABELS[passport] || String(value || "Gris clair");
}
