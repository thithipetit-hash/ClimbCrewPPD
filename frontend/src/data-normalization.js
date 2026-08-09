import { GRADES } from "./climbing-calculations.js";
import { normalizeRopeNumber } from "./route-utils.js";

const SESSION_STATUSES = new Set([
  "libre", "encadree", "passeport", "challenge", "renouvellement", "fermee",
]);
const SESSION_SLOTS = new Set(["matin", "midi", "soir"]);
const REALISATION_STYLES = new Set([
  "a_vue", "flash", "en_tete", "moulinette", "avec_repos",
  "travaillee", "projet", "non_enchainee", "test",
]);
const PASSPORTS = new Set(["sans", "jaune", "orange", "vert", "bleu", "decouverte"]);

function text(value) {
  return String(value ?? "").trim();
}

function identifier(value) {
  return text(value);
}

function booleanValue(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;

  const normalized = text(value).toLowerCase();
  if (["true", "oui", "yes", "on"].includes(normalized)) return true;
  if (["false", "non", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function isoDate(value) {
  const candidate = text(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : "";
}

function normalizedWord(value) {
  return text(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function grade(value, fallback = "nc") {
  const candidate = text(value);
  return GRADES.includes(candidate) ? candidate : fallback;
}

export function normalizeParticipant(participant = {}) {
  const passport = normalizedWord(participant.passport);
  return {
    ...participant,
    id: identifier(participant.id),
    nom: text(participant.nom),
    prenom: text(participant.prenom),
    email: text(participant.email).toLowerCase(),
    passport: PASSPORTS.has(passport) ? passport : "sans",
    cotisation: booleanValue(participant.cotisation),
    ffme: booleanValue(participant.ffme),
    canEncadrer: booleanValue(participant.canEncadrer ?? participant.can_encadrer),
    canReferer: booleanValue(participant.canReferer ?? participant.can_referer),
    canAdmin: booleanValue(participant.canAdmin ?? participant.can_admin),
  };
}

export function normalizeSession(session = {}) {
  const slot = normalizedWord(session.slot);
  const status = normalizedWord(session.status);
  const participantIds = Array.isArray(session.participantIds ?? session.participant_ids)
    ? (session.participantIds ?? session.participant_ids)
    : [];

  return {
    ...session,
    id: identifier(session.id),
    date: isoDate(session.date),
    slot: SESSION_SLOTS.has(slot) ? slot : "midi",
    status: SESSION_STATUSES.has(status) ? status : "libre",
    encadrantId: identifier(session.encadrantId ?? session.encadrant_id) || null,
    referentId: identifier(session.referentId ?? session.referent_id) || null,
    participantIds: [...new Set(participantIds.map(identifier).filter(Boolean))],
  };
}

export function normalizeRope(rope = {}) {
  return {
    ...rope,
    id: identifier(rope.id || `rope-${normalizeRopeNumber(rope.numeroCorde)}`),
    numeroCorde: normalizeRopeNumber(rope.numeroCorde),
    couleurCorde: text(rope.couleurCorde ?? rope.couleur_corde),
  };
}

export function normalizeRoute(route = {}) {
  const reference = grade(route.cotationReference ?? route.cotation_reference, "5c");
  return {
    ...route,
    id: identifier(route.id),
    numeroCorde: normalizeRopeNumber(route.numeroCorde ?? route.numero_corde),
    couleurPrises: text(route.couleurPrises ?? route.couleur_prises) || "Blanc",
    cotationReference: reference,
    cotationAjustee: grade(route.cotationAjustee ?? route.cotation_ajustee, reference),
    nomVoie: text(route.nomVoie ?? route.nom_voie),
    nomOuvreur: text(route.nomOuvreur ?? route.nom_ouvreur),
    moulinetteOnly: booleanValue(route.moulinetteOnly ?? route.moulinette_only),
    active: booleanValue(route.active, true),
    dateCreation: isoDate(route.dateCreation ?? route.date_creation),
  };
}

export function normalizeRealisation(realisation = {}) {
  return {
    ...realisation,
    id: identifier(realisation.id),
    participantId: identifier(realisation.participantId ?? realisation.participant_id),
    voieId: identifier(realisation.voieId ?? realisation.voie_id),
    sessionId: identifier(realisation.sessionId ?? realisation.session_id),
    dateRealisation: isoDate(realisation.dateRealisation ?? realisation.date_realisation),
    styleRealisation: REALISATION_STYLES.has(
      normalizedWord(realisation.styleRealisation ?? realisation.style_realisation),
    )
      ? normalizedWord(realisation.styleRealisation ?? realisation.style_realisation)
      : "test",
    commentaire: text(realisation.commentaire),
    cotationProposee: grade(
      realisation.cotationProposee ?? realisation.cotation_proposee,
      "",
    ),
    rating: Number.isInteger(Number(realisation.rating)) ? Number(realisation.rating) : null,
    tags: Array.isArray(realisation.tags) ? [...new Set(realisation.tags.map(text).filter(Boolean))] : [],
  };
}

function normalizedArray(value, fallback, normalizer) {
  const source = Array.isArray(value) ? value : Array.isArray(fallback) ? fallback : [];
  return source
    .filter((item) => item && typeof item === "object")
    .map(normalizer)
    .filter((item) => item.id);
}

export function normalizeAppData(data = {}, fallback = {}) {
  return {
    ...fallback,
    ...data,
    participants: normalizedArray(data.participants, fallback.participants, normalizeParticipant),
    sessions: normalizedArray(data.sessions, fallback.sessions, normalizeSession),
    ropes: normalizedArray(data.ropes, fallback.ropes, normalizeRope),
    routes: normalizedArray(data.routes, fallback.routes, normalizeRoute),
    realisations: normalizedArray(
      data.realisations,
      fallback.realisations,
      normalizeRealisation,
    ),
    selectedDate: isoDate(data.selectedDate) || isoDate(fallback.selectedDate),
    selectedParticipantProgress: identifier(
      data.selectedParticipantProgress ?? fallback.selectedParticipantProgress,
    ),
  };
}
