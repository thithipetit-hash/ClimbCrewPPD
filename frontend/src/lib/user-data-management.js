import { PASSPORT_OPTIONS } from "../../../shared/passports.js";
import { FFME_ADULT_CATEGORIES, getFfmeAgeCategory } from "../../../shared/ffme-age-categories.js";

export const USER_DATA_BOOLEAN_KEYS = new Set([
  "accountAssociated",
  "passportDecouverte",
  "cotisation",
  "passeportFfme",
  "ffme",
  "canEncadrer",
  "canReferer",
  "canAdmin",
  "initiateurSae",
  "initiateurSne",
]);

export const USER_DATA_COLUMNS = [
  ["nom", "Nom"],
  ["prenom", "Prénom"],
  ["email", "E-mail"],
  ["accountAssociated", "Compte associé"],
  ["sexe", "Sexe"],
  ["anneeNaissance", "Année naissance"],
  ["categorieFfme", "Catégorie FFME"],
  ["passport", "Couleur passeport"],
  ["passportDecouverte", "Découverte"],
  ["passeportFfme", "Passeport FFME"],
  ["cotisation", "Cotisation"],
  ["ffme", "FFME"],
  ["canEncadrer", "Encadrant"],
  ["canReferer", "Référent"],
  ["canAdmin", "Administrateur"],
  ["initiateurSae", "Initiateur SAE"],
  ["initiateurSne", "Initiateur SNE"],
  ["sessions", "Séances"],
];

export const USER_DATA_PASSPORT_OPTIONS = PASSPORT_OPTIONS;

export const USER_DATA_FILTER_CHOICES = {
  sexe: [["h", "H"], ["f", "F"]],
  passport: PASSPORT_OPTIONS.map(({ value, label }) => [value, label]),
  categorieFfme: FFME_ADULT_CATEGORIES.map((label) => [label, label]),
};

export const USER_DATA_COLUMN_WIDTHS = {
  nom: "8%",
  prenom: "8%",
  email: "15%",
  accountAssociated: "6%",
  sexe: "4%",
  anneeNaissance: "6%",
  categorieFfme: "7%",
  passport: "7%",
  passportDecouverte: "6%",
  passeportFfme: "6%",
  cotisation: "5%",
  ffme: "4%",
  canEncadrer: "5%",
  canReferer: "5%",
  canAdmin: "6%",
  initiateurSae: "6%",
  initiateurSne: "6%",
  sessions: "5%",
};

export function yesNo(value) {
  return value ? "Oui" : "Non";
}

export function displayUserDataValue(participant, key) {
  if (USER_DATA_BOOLEAN_KEYS.has(key)) return yesNo(Boolean(participant[key]));
  if (key === "categorieFfme") {
    return getFfmeAgeCategory(participant.anneeNaissance) || "Non renseignée";
  }
  if (key === "sexe") {
    if (participant[key] === "h") return "H";
    if (participant[key] === "f") return "F";
    return "";
  }
  if (key === "passport") {
    return PASSPORT_OPTIONS.find(({ value }) => value === participant[key])?.label
      || participant[key]
      || "Gris clair";
  }
  return participant[key] ?? "";
}

export function compactUserDataColumnWidth(key) {
  return USER_DATA_COLUMN_WIDTHS[key] || "6%";
}

export function buildParticipantUpdatePayload(participant, draft) {
  return {
    ...participant,
    ...draft,
    nom: String(draft.nom || "").trim(),
    prenom: String(draft.prenom || "").trim(),
    email: String(draft.email || "").trim(),
    sexe: draft.sexe || "",
    anneeNaissance: draft.anneeNaissance === "" ? null : (draft.anneeNaissance ?? null),
    passport: draft.passport || "sans",
    passportDecouverte: Boolean(draft.passportDecouverte),
    passeportFfme: Boolean(draft.passeportFfme),
    cotisation: Boolean(draft.cotisation),
    ffme: Boolean(draft.ffme),
    canEncadrer: Boolean(draft.canEncadrer),
    canReferer: Boolean(draft.canReferer),
    canAdmin: Boolean(draft.canAdmin),
  };
}

export function participantQualificationsChanged(participant, draft) {
  return Boolean(draft.initiateurSae) !== Boolean(participant.initiateurSae)
    || Boolean(draft.initiateurSne) !== Boolean(participant.initiateurSne);
}

export function buildParticipantQualificationsPayload(draft) {
  return {
    initiateurSae: Boolean(draft.initiateurSae),
    initiateurSne: Boolean(draft.initiateurSne),
  };
}
