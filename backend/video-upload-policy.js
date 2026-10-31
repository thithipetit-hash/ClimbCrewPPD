const VIDEO_CHUNK_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
let nextVideoChunkCleanupAt = 0;

export const LOCAL_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const VIDEO_UPLOAD_CHUNK_MAX_BYTES = 1024 * 1024;
export const VIDEO_UPLOAD_MAX_PARTS = 80;
export const VIDEO_UPLOAD_ID_PATTERN = /^[A-Za-z0-9._-]{8,120}$/;
export const LOCAL_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
]);

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

export function decodeVideoFileName(value) {
  let fileName = "video";
  try {
    fileName = decodeURIComponent(String(value || "video"));
  } catch {
    fileName = "video";
  }
  return fileName.replace(/[\r\n]/g, "").slice(0, 180) || "video";
}

function parseInteger(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return NaN;
  const parsed = Number(raw);
  return Number.isInteger(parsed) ? parsed : NaN;
}

export function readVideoChunkRequest(req) {
  const uploadId = String(req.params?.uploadId || "");
  const partNumber = parseInteger(req.params?.partNumber);
  const totalParts = parseInteger(req.headers?.["x-total-parts"]);
  const totalBytes = parseInteger(req.headers?.["x-total-bytes"]);
  const mimeType = String(req.headers?.["x-video-mime-type"] || "").trim().toLowerCase();
  const fileName = decodeVideoFileName(req.headers?.["x-file-name"]);

  if (!VIDEO_UPLOAD_ID_PATTERN.test(uploadId)) {
    throw httpError(400, "Identifiant de transfert vidéo invalide.");
  }
  if (!Number.isInteger(totalParts) || totalParts < 1 || totalParts > VIDEO_UPLOAD_MAX_PARTS) {
    throw httpError(400, "Nombre de blocs vidéo invalide.");
  }
  if (!Number.isInteger(partNumber) || partNumber < 0 || partNumber >= totalParts) {
    throw httpError(400, "Numéro de bloc vidéo invalide.");
  }
  if (!Number.isInteger(totalBytes) || totalBytes < 1 || totalBytes > LOCAL_VIDEO_MAX_BYTES) {
    throw httpError(400, "Taille totale de vidéo invalide.");
  }
  if (!LOCAL_VIDEO_TYPES.has(mimeType)) {
    throw httpError(400, "Format vidéo refusé. Utilisez MP4, WebM, OGG ou MOV.");
  }

  return { uploadId, partNumber, totalParts, totalBytes, mimeType, fileName };
}

export function assertVideoChunkBody(body) {
  if (!Buffer.isBuffer(body) || body.length === 0) {
    throw httpError(400, "Bloc vidéo vide.");
  }
  if (body.length > VIDEO_UPLOAD_CHUNK_MAX_BYTES) {
    throw httpError(413, "Bloc vidéo trop volumineux.");
  }
}

export function validateStoredVideoChunks(rows, {
  expectedRouteId = null,
  expectedRealisationId = null,
} = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw httpError(400, "Aucun bloc vidéo reçu pour ce transfert.");
  }

  const first = rows[0];
  const totalParts = Number(first.total_parts);
  const totalBytes = Number(first.total_bytes);
  if (!Number.isInteger(totalParts) || totalParts < 1 || totalParts > VIDEO_UPLOAD_MAX_PARTS || rows.length !== totalParts) {
    throw httpError(409, "Le transfert vidéo est incomplet.");
  }
  if (!Number.isInteger(totalBytes) || totalBytes < 1 || totalBytes > LOCAL_VIDEO_MAX_BYTES) {
    throw httpError(409, "La taille de la vidéo assemblée est invalide.");
  }
  if (!LOCAL_VIDEO_TYPES.has(String(first.mime_type || "").toLowerCase())) {
    throw httpError(400, "Format vidéo refusé. Utilisez MP4, WebM, OGG ou MOV.");
  }

  let receivedBytes = 0;
  rows.forEach((row, index) => {
    const consistent = Number(row.part_number) === index
      && String(row.route_id) === String(first.route_id)
      && String(row.realisation_id) === String(first.realisation_id)
      && String(row.file_name) === String(first.file_name)
      && String(row.mime_type) === String(first.mime_type)
      && Number(row.total_parts) === totalParts
      && Number(row.total_bytes) === totalBytes;
    if (!consistent) throw httpError(409, "Les blocs de la vidéo ne sont pas cohérents.");
    receivedBytes += Number(row.content_bytes || 0);
  });

  if (expectedRouteId !== null && String(first.route_id) !== String(expectedRouteId)) {
    throw httpError(409, "Les blocs de la vidéo ne correspondent pas à la voie attendue.");
  }
  if (expectedRealisationId !== null && String(first.realisation_id) !== String(expectedRealisationId)) {
    throw httpError(409, "Les blocs de la vidéo ne correspondent pas à la réalisation attendue.");
  }
  if (receivedBytes !== totalBytes || receivedBytes > LOCAL_VIDEO_MAX_BYTES) {
    throw httpError(409, "La taille de la vidéo assemblée est invalide.");
  }

  return { first, totalParts, totalBytes, receivedBytes };
}

export async function cleanupExpiredVideoChunks(pool) {
  const now = Date.now();
  if (now < nextVideoChunkCleanupAt) return;
  nextVideoChunkCleanupAt = now + VIDEO_CHUNK_CLEANUP_INTERVAL_MS;
  try {
    await pool.query("delete from route_video_upload_chunks where created_at < now() - interval '24 hours'");
  } catch (error) {
    nextVideoChunkCleanupAt = 0;
    throw error;
  }
}
