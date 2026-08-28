import crypto from "node:crypto";
import { getPool } from "./database.js";
import {
  REMOTE_CUSTOM_AVATAR_MARKER,
  serializeParticipant,
} from "./participant-privacy-service.js";

const CUSTOM_AVATAR_MAX_CHARS = 450_000;
const WEBP_DATA_URL_PREFIX = "data:image/webp;base64,";

function currentUser(req) {
  return req.auth?.user || req.enhancementAuth?.user || null;
}

function participantIdForUser(user) {
  return String(user?.participantId || user?.participant_id || "");
}

function userIsAdmin(user) {
  return Boolean(user && (user.role === "admin" || user.is_admin));
}

function isWebpBuffer(buffer) {
  return Buffer.isBuffer(buffer)
    && buffer.length >= 12
    && buffer.subarray(0, 4).toString("ascii") === "RIFF"
    && buffer.subarray(8, 12).toString("ascii") === "WEBP";
}

/** Décode et contrôle réellement le WebP avant stockage ou diffusion. */
export function decodeCustomAvatarDataUrl(value) {
  const dataUrl = String(value || "");
  if (!dataUrl.startsWith(WEBP_DATA_URL_PREFIX) || dataUrl.length > CUSTOM_AVATAR_MAX_CHARS) {
    throw new Error("L’image personnalisée doit être un WebP 512×512 de moins de 450 Ko.");
  }

  const encoded = dataUrl.slice(WEBP_DATA_URL_PREFIX.length);
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new Error("L’image personnalisée WebP est invalide.");
  }

  const buffer = Buffer.from(encoded, "base64");
  if (!isWebpBuffer(buffer)) {
    throw new Error("L’image personnalisée ne contient pas un WebP valide.");
  }
  return buffer;
}

/**
 * La valeur `remote` est un petit marqueur de compatibilité frontend : elle
 * signifie « conserver l'image déjà stockée » sans retransmettre le Base64.
 */
export function resolveCustomAvatarUpdate(value) {
  if (value === undefined || value === null || value === REMOTE_CUSTOM_AVATAR_MARKER) {
    return { keepExisting: true, value: null };
  }
  if (value === "") return { keepExisting: false, value: "" };
  decodeCustomAvatarDataUrl(value);
  return { keepExisting: false, value: String(value) };
}

function cleanChoice(value, fallback) {
  const normalized = String(value || fallback).trim().toLowerCase();
  return /^[a-z0-9_]{2,40}$/.test(normalized) ? normalized : fallback;
}

function cleanSexe(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["", "h", "m", "f"].includes(normalized)) {
    return normalized === "m" ? "h" : normalized;
  }
  throw new Error("Le sexe doit être Homme, Femme ou Non précisé.");
}

/** Remplace PATCH /participants/me/profile sans renvoyer l'image Base64. */
export async function updateOwnParticipantProfile(req, res) {
  const user = currentUser(req);
  const participantId = Number(participantIdForUser(user));
  if (!Number.isInteger(participantId) || participantId <= 0) {
    return res.status(409).json({ error: "Le compte n'est pas relié à une fiche grimpeur" });
  }

  try {
    const avatarId = cleanChoice(req.body?.avatarId, "gecko");
    const crestId = cleanChoice(req.body?.crestId, "cristal");
    const profilePublic = req.body?.profilePublic !== false;
    const customAvatar = resolveCustomAvatarUpdate(req.body?.customAvatarImage);
    const sexe = cleanSexe(req.body?.sexe);

    const result = await getPool().query(
      `
        update participants
        set avatar_id = $2,
            crest_id = $3,
            profile_public = $4,
            custom_avatar_image = case when $5::boolean then custom_avatar_image else $6 end,
            sexe = $7
        where id = $1
        returning
          id, nom, prenom, email, login_email, passport, sexe, cotisation, ffme,
          initiateur_sae, initiateur_sne,
          can_encadrer, can_referer, can_admin, avatar_id, crest_id, profile_public,
          (coalesce(custom_avatar_image, '') <> '') as has_custom_avatar
      `,
      [
        participantId,
        avatarId,
        crestId,
        profilePublic,
        customAvatar.keepExisting,
        customAvatar.value,
        sexe,
      ],
    );

    if (!result.rowCount) return res.status(404).json({ error: "Grimpeur introuvable" });
    return res.json(serializeParticipant(result.rows[0]));
  } catch (error) {
    if (/image personnalisée|WebP|sexe/i.test(String(error.message || ""))) {
      return res.status(400).json({ error: error.message });
    }
    console.error("PATCH /participants/me/profile", error);
    return res.status(500).json({ error: "Enregistrement du profil impossible" });
  }
}

/**
 * Diffuse le WebP uniquement à un membre autorisé. Un profil privé reste visible
 * seulement par son propriétaire ou un administrateur.
 */
export async function getParticipantCustomAvatar(req, res) {
  const participantId = Number(req.params?.id);
  if (!Number.isInteger(participantId) || participantId <= 0) {
    return res.status(400).json({ error: "Identifiant du grimpeur invalide" });
  }

  try {
    const result = await getPool().query(
      `select id, profile_public, custom_avatar_image from participants where id = $1 limit 1`,
      [participantId],
    );
    const participant = result.rows[0];
    if (!participant) return res.status(404).json({ error: "Grimpeur introuvable" });

    const user = currentUser(req);
    const isOwner = participantIdForUser(user) === String(participant.id);
    if (!participant.profile_public && !isOwner && !userIsAdmin(user)) {
      return res.status(403).json({ error: "Avatar privé" });
    }
    if (!participant.custom_avatar_image) {
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(404).json({ error: "Aucune image personnalisée" });
    }

    const buffer = decodeCustomAvatarDataUrl(participant.custom_avatar_image);
    const etag = `"sha256-${crypto.createHash("sha256").update(buffer).digest("hex")}"`;

    res.setHeader("Cache-Control", "private, max-age=0, must-revalidate");
    res.setHeader("ETag", etag);
    res.vary("Cookie");
    res.setHeader("X-Content-Type-Options", "nosniff");

    if (String(req.headers?.["if-none-match"] || "") === etag) {
      return res.status(304).end();
    }

    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Content-Length", String(buffer.length));
    return res.status(200).send(buffer);
  } catch (error) {
    console.error("GET /participants/:id/avatar", error);
    return res.status(500).json({ error: "Chargement de l’avatar impossible" });
  }
}
