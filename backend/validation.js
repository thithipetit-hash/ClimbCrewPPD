/**
 * Validation des données reçues par l'API.
 *
 * Les fonctions retournent une copie normalisée et lèvent ValidationError
 * lorsqu'une valeur ne peut pas être acceptée sans ambiguïté.
 */

export const GRADES = [
  "4a", "4b", "4c", "5a", "5b", "5c", "6a", "6a+",
  "6b", "6b+", "6c", "6c+", "7a", "7a+", "7b",
];
export const PASSPORTS = ["sans", "jaune", "orange", "vert", "bleu", "decouverte"];
export const SESSION_SLOTS = ["matin", "midi", "soir"];
export const SESSION_STATUSES = [
  "libre", "encadree", "passeport", "challenge", "renouvellement", "fermee",
];
export const REALISATION_STYLES = [
  "a_vue", "flash", "en_tete", "moulinette", "avec_repos",
  "travaillee", "projet", "non_enchainee", "test",
];
export const REALISATION_TAGS = [
  "dalle", "devers", "physique", "technique", "a_doigts",
  "continuite", "morphologique", "engagee",
];

export class ValidationError extends Error {
  constructor(message, fields = {}) {
    super(message);
    this.name = "ValidationError";
    this.status = 400;
    this.fields = fields;
  }
}

function stringValue(value) {
  return String(value ?? "").trim();
}

function requiredString(value, field, maxLength = 250) {
  const normalized = stringValue(value);
  if (!normalized) throw new ValidationError(`${field} est obligatoire.`, { [field]: "required" });
  if (normalized.length > maxLength) {
    throw new ValidationError(`${field} dépasse ${maxLength} caractères.`, { [field]: "too_long" });
  }
  return normalized;
}

function optionalString(value, field, maxLength = 2000) {
  const normalized = stringValue(value);
  if (normalized.length > maxLength) {
    throw new ValidationError(`${field} dépasse ${maxLength} caractères.`, { [field]: "too_long" });
  }
  return normalized;
}

function enumValue(value, field, allowed, fallback = null) {
  const normalized = stringValue(value).toLowerCase();
  if (!normalized && fallback !== null) return fallback;
  if (!allowed.includes(normalized)) {
    throw new ValidationError(
      `${field} doit être l'une des valeurs suivantes : ${allowed.join(", ")}.`,
      { [field]: "invalid_enum" },
    );
  }
  return normalized;
}

function strictBoolean(value, field, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || String(value).toLowerCase() === "true") return true;
  if (value === 0 || value === "0" || String(value).toLowerCase() === "false") return false;
  throw new ValidationError(`${field} doit être un booléen.`, { [field]: "invalid_boolean" });
}

function isoDate(value, field) {
  const normalized = stringValue(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new ValidationError(`${field} doit respecter le format AAAA-MM-JJ.`, { [field]: "invalid_date" });
  }

  const date = new Date(`${normalized}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) {
    throw new ValidationError(`${field} contient une date impossible.`, { [field]: "invalid_date" });
  }
  return normalized;
}

function ropeNumber(value) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 0 || normalized > 21) {
    throw new ValidationError("numeroCorde doit être un entier compris entre 0 et 21.", {
      numeroCorde: "out_of_range",
    });
  }
  return normalized;
}

function grade(value, field, { optional = false, fallback = null } = {}) {
  const normalized = stringValue(value);
  if (!normalized && optional) return "";
  if (!normalized && fallback) return fallback;
  if (!GRADES.includes(normalized)) {
    throw new ValidationError(`${field} doit être une cotation comprise entre 4a et 7b.`, {
      [field]: "invalid_grade",
    });
  }
  return normalized;
}

function identifier(value, field) {
  return requiredString(value, field, 250);
}

function email(value) {
  const normalized = stringValue(value).toLowerCase();
  if (!normalized) return "";
  if (normalized.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new ValidationError("email n'est pas une adresse valide.", { email: "invalid_email" });
  }
  return normalized;
}

export function validateParticipantPayload(payload = {}) {
  return {
    ...payload,
    nom: requiredString(payload.nom, "nom", 120),
    prenom: requiredString(payload.prenom, "prenom", 120),
    email: email(payload.email),
    passport: enumValue(payload.passport, "passport", PASSPORTS, "sans"),
    cotisation: strictBoolean(payload.cotisation, "cotisation"),
    ffme: strictBoolean(payload.ffme, "ffme"),
    canEncadrer: strictBoolean(payload.canEncadrer, "canEncadrer"),
    canReferer: strictBoolean(payload.canReferer, "canReferer"),
    canAdmin: strictBoolean(payload.canAdmin, "canAdmin"),
  };
}

export function validateRopePayload(payload = {}) {
  return {
    ...payload,
    numeroCorde: ropeNumber(payload.numeroCorde),
    couleurCorde: optionalString(payload.couleurCorde, "couleurCorde", 80),
    actif: strictBoolean(payload.actif, "actif", true),
  };
}

export function validateRoutePayload(payload = {}, { partial = false } = {}) {
  const validated = { ...payload };

  if (!partial || payload.numeroVoieUnique !== undefined) {
    validated.numeroVoieUnique = requiredString(
      payload.numeroVoieUnique ?? payload.id,
      "numeroVoieUnique",
      250,
    );
  }
  if (!partial || payload.numeroCorde !== undefined) {
    validated.numeroCorde = ropeNumber(payload.numeroCorde);
  }
  if (!partial || payload.couleurPrises !== undefined) {
    validated.couleurPrises = requiredString(payload.couleurPrises, "couleurPrises", 80);
  }
  if (!partial || payload.cotationReference !== undefined) {
    validated.cotationReference = grade(payload.cotationReference, "cotationReference");
  }
  if (!partial || payload.cotationAjustee !== undefined) {
    validated.cotationAjustee = grade(
      payload.cotationAjustee,
      "cotationAjustee",
      { fallback: validated.cotationReference },
    );
  }
  if (!partial || payload.nomVoie !== undefined) {
    validated.nomVoie = optionalString(payload.nomVoie, "nomVoie", 250);
  }
  if (!partial || payload.nomOuvreur !== undefined) {
    validated.nomOuvreur = requiredString(payload.nomOuvreur, "nomOuvreur", 250);
  }
  if (!partial || payload.moulinetteOnly !== undefined) {
    validated.moulinetteOnly = strictBoolean(payload.moulinetteOnly, "moulinetteOnly");
  }
  if (!partial || payload.active !== undefined) {
    validated.active = strictBoolean(payload.active, "active", true);
  }
  if (!partial || payload.dateCreation !== undefined) {
    validated.dateCreation = isoDate(payload.dateCreation, "dateCreation");
  }

  return validated;
}

export function validateRouteRating(value) {
  const rating = Number(value);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new ValidationError("La note doit être un entier compris entre 1 et 5.", {
      rating: "out_of_range",
    });
  }
  return rating;
}

export function validateSessionPayload(payload = {}, idFromPath = "") {
  const participantIds = payload.participantIds ?? [];
  if (!Array.isArray(participantIds)) {
    throw new ValidationError("participantIds doit être un tableau.", {
      participantIds: "invalid_array",
    });
  }

  return {
    ...payload,
    id: identifier(idFromPath || payload.id, "id"),
    date: isoDate(payload.date, "date"),
    slot: enumValue(payload.slot, "slot", SESSION_SLOTS),
    status: payload.status
      ? enumValue(payload.status, "status", SESSION_STATUSES)
      : null,
    encadrantId: stringValue(payload.encadrantId) || null,
    referentId: stringValue(payload.referentId) || null,
    participantIds: [...new Set(
      participantIds.map((value) => identifier(value, "participantId")),
    )],
  };
}

export function validateRealisationPayload(payload = {}, { partial = false } = {}) {
  const validated = { ...payload };

  if (!partial || payload.id !== undefined) validated.id = identifier(payload.id, "id");
  if (!partial || payload.participantId !== undefined) {
    validated.participantId = identifier(payload.participantId, "participantId");
  }
  if (!partial || payload.sessionId !== undefined) {
    validated.sessionId = identifier(payload.sessionId, "sessionId");
  }
  if (!partial || payload.voieId !== undefined) {
    validated.voieId = identifier(payload.voieId, "voieId");
  }
  if (!partial || payload.dateRealisation !== undefined) {
    validated.dateRealisation = isoDate(payload.dateRealisation, "dateRealisation");
  }
  if (!partial || payload.styleRealisation !== undefined) {
    validated.styleRealisation = enumValue(
      payload.styleRealisation,
      "styleRealisation",
      REALISATION_STYLES,
    );
  }
  if (!partial || payload.commentaire !== undefined) {
    validated.commentaire = optionalString(payload.commentaire, "commentaire", 2000);
  }
  if (!partial || payload.cotationProposee !== undefined) {
    validated.cotationProposee = grade(
      payload.cotationProposee,
      "cotationProposee",
      { optional: true },
    );
  }
  if (!partial || payload.nbEssais !== undefined) {
    validated.nbEssais = optionalString(payload.nbEssais, "nbEssais", 50);
  }
  if (payload.rating !== undefined && payload.rating !== null && payload.rating !== "") {
    validated.rating = validateRouteRating(payload.rating);
  }
  if (!partial || payload.tags !== undefined) {
    if (payload.tags !== undefined && !Array.isArray(payload.tags)) {
      throw new ValidationError("tags doit être un tableau.", { tags: "invalid_array" });
    }
    const tags = [...new Set((payload.tags || []).map((tag) => stringValue(tag).toLowerCase()))];
    if (tags.some((tag) => !REALISATION_TAGS.includes(tag))) {
      throw new ValidationError("Un tag de réalisation est invalide.", { tags: "invalid_enum" });
    }
    validated.tags = tags;
  }

  return validated;
}

export function validateLegacyImportPayload(inputPayload = {}) {
  const payload = inputPayload?.data || inputPayload;
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.participants)) {
    throw new ValidationError(
      "Fichier legacy invalide : le tableau participants est obligatoire.",
      { participants: "required_array" },
    );
  }

  return {
    ...payload,
    participants: payload.participants.map(validateParticipantPayload),
    ropes: (payload.ropes || []).map(validateRopePayload),
    routes: (payload.routes || []).map((route) => validateRoutePayload({
      ...route,
      numeroVoieUnique: route.numeroVoieUnique || route.id,
      numeroCorde: route.numeroCorde === "" || route.numeroCorde == null ? 0 : route.numeroCorde,
      cotationReference: route.cotationReference || "5c",
      cotationAjustee: route.cotationAjustee || route.cotationReference || "5c",
      couleurPrises: route.couleurPrises || "Blanc",
      nomOuvreur: route.nomOuvreur || "Inconnu",
      dateCreation: route.dateCreation || new Date().toISOString().slice(0, 10),
    })),
    sessions: (payload.sessions || []).map((session) => validateSessionPayload(session)),
    realisations: (payload.realisations || []).map((realisation, index) => validateRealisationPayload({
      ...realisation,
      id: realisation.id || `real-import-${index + 1}`,
      styleRealisation: realisation.styleRealisation || "test",
      dateRealisation: realisation.dateRealisation || new Date().toISOString().slice(0, 10),
    })),
  };
}
