import crypto from "node:crypto";
import express from "express";
import { validateRealisationPayload } from "./validation.js";
import { assertRealisationIntegrity } from "./realisation-integrity.js";

const LOCAL_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
const VIDEO_UPLOAD_CHUNK_MAX_BYTES = 1024 * 1024;
const VIDEO_UPLOAD_MAX_PARTS = 80;
const VIDEO_UPLOAD_ID_PATTERN = /^[A-Za-z0-9._-]{8,120}$/;
const LOCAL_VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/ogg", "video/quicktime"]);

function normalizeVideoUrls(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    const error = new Error("videoUrls doit être un tableau.");
    error.status = 400;
    throw error;
  }
  const urls = [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))];
  if (urls.length > 3) {
    const error = new Error("Trois vidéos maximum peuvent être associées à une réalisation.");
    error.status = 400;
    throw error;
  }
  if (urls.some((url) => url.length > 2000)) {
    const error = new Error("Une URL vidéo est trop longue.");
    error.status = 400;
    throw error;
  }
  return urls;
}

async function assertVideoUrlsBelongToRoute(pool, voieId, videoUrls) {
  if (!videoUrls?.length) return;
  const result = await pool.query(
    "select video_urls from routes where id = $1 limit 1",
    [voieId],
  );
  if (result.rowCount === 0) {
    const error = new Error("Voie introuvable");
    error.status = 400;
    throw error;
  }
  const allowed = new Set(Array.isArray(result.rows[0].video_urls) ? result.rows[0].video_urls.map(String) : []);
  const invalid = videoUrls.find((url) => !allowed.has(url));
  if (invalid) {
    const error = new Error("La vidéo sélectionnée n’appartient pas à cette voie.");
    error.status = 400;
    throw error;
  }
}

function rowToIntegrityCandidate(row, patch, participantId) {
  const chute = patch.chute ?? Boolean(row.chute);
  return {
    participantId: String(participantId),
    sessionId: patch.sessionId ?? row.session_id,
    voieId: patch.voieId ?? row.voie_id,
    dateRealisation: patch.dateRealisation ?? row.date_realisation,
    chute,
    assureurId: chute ? (patch.assureurId ?? row.assureur_id ?? "") : "",
  };
}

function decodeVideoFileName(value) {
  let fileName = "video";
  try {
    fileName = decodeURIComponent(String(value || "video"));
  } catch {
    fileName = "video";
  }
  return fileName.replace(/[\r\n]/g, "").slice(0, 180) || "video";
}

function parseIntegerHeader(req, name) {
  const value = Number.parseInt(String(req.headers[name] || ""), 10);
  return Number.isInteger(value) ? value : NaN;
}

async function persistRealisationVideo({
  client,
  participantId,
  realisationId,
  content,
  mimeType,
  fileName,
  authUserId,
  ipAddress,
  userAgent,
}) {
  const realisationResult = await client.query(
    `
      select voie_id, video_urls
      from realisations
      where id = $1 and participant_id = $2
      for update
    `,
    [realisationId, participantId],
  );
  if (!realisationResult.rowCount) {
    const error = new Error("Cette réalisation ne vous appartient pas");
    error.status = 403;
    throw error;
  }

  const realisation = realisationResult.rows[0];
  const currentRealisationUrls = Array.isArray(realisation.video_urls)
    ? realisation.video_urls.map(String)
    : [];
  if (currentRealisationUrls.length >= 3) {
    const error = new Error("Trois vidéos maximum peuvent être associées à une réalisation.");
    error.status = 400;
    throw error;
  }

  const routeResult = await client.query(
    `select video_urls from routes where id = $1 for update`,
    [realisation.voie_id],
  );
  if (!routeResult.rowCount) {
    const error = new Error("Voie introuvable");
    error.status = 404;
    throw error;
  }
  const currentRouteUrls = Array.isArray(routeResult.rows[0].video_urls)
    ? routeResult.rows[0].video_urls.map(String)
    : [];
  if (currentRouteUrls.length >= 10) {
    const error = new Error("10 vidéos maximum par voie.");
    error.status = 400;
    throw error;
  }

  const videoId = crypto.randomUUID();
  const url = `/routes/${encodeURIComponent(realisation.voie_id)}/videos/${videoId}`;

  await client.query(
    `insert into route_videos (id, route_id, file_name, mime_type, content, source_realisation_id) values ($1,$2,$3,$4,$5,$6)`,
    [videoId, realisation.voie_id, fileName, mimeType, content, realisationId],
  );
  const updatedRoute = await client.query(
    `update routes set video_urls = array_append(video_urls, $2), updated_at = now() where id = $1 returning video_urls`,
    [realisation.voie_id, url],
  );
  const nextRealisationUrls = [...currentRealisationUrls, url];
  await client.query(
    `update realisations set video_urls = $3::jsonb, updated_at = now() where id = $1 and participant_id = $2`,
    [realisationId, participantId, JSON.stringify(nextRealisationUrls)],
  );
  await client.query(
    `
      insert into access_logs (user_id, event_type, success, ip_address, user_agent, details)
      values ($1, 'realisation_video_upload', true, $2, $3, $4::jsonb)
    `,
    [
      authUserId || null,
      ipAddress || null,
      userAgent || null,
      JSON.stringify({
        realisation_id: realisationId,
        route_id: realisation.voie_id,
        video_id: videoId,
        file_name: fileName,
        size_bytes: content.length,
      }),
    ],
  );

  return {
    url,
    videoUrls: nextRealisationUrls,
    routeVideoUrls: Array.isArray(updatedRoute.rows[0]?.video_urls)
      ? updatedRoute.rows[0].video_urls.map(String)
      : [...currentRouteUrls, url],
  };
}

export function installRealisationManagementRoutes(app, { requireAuth, pool }) {
  let videoSchemaReady = false;
  async function ensureVideoSchema() {
    if (videoSchemaReady) return;
    await pool.query(`
      alter table routes
      add column if not exists video_urls text[] not null default '{}'
    `);
    await pool.query(`
      create table if not exists route_videos (
        id text primary key,
        route_id text not null references routes(id) on delete cascade,
        file_name text not null default 'video',
        mime_type text not null,
        content bytea not null,
        created_at timestamptz not null default now()
      )
    `);
    await pool.query(`
      alter table route_videos
      add column if not exists source_realisation_id text
    `);
    await pool.query(`
      create table if not exists route_video_upload_chunks (
        participant_id text not null,
        upload_id text not null,
        part_number integer not null,
        realisation_id text not null,
        route_id text not null,
        file_name text not null default 'video',
        mime_type text not null,
        total_parts integer not null,
        total_bytes bigint not null,
        content bytea not null,
        created_at timestamptz not null default now(),
        primary key (participant_id, upload_id, part_number)
      )
    `);
    await pool.query(`create index if not exists idx_route_videos_route on route_videos(route_id)`);
    await pool.query(`create index if not exists idx_route_videos_source_realisation on route_videos(source_realisation_id)`);
    await pool.query(`create index if not exists idx_route_video_upload_chunks_realisation on route_video_upload_chunks(realisation_id, participant_id)`);
    videoSchemaReady = true;
  }

  app.post("/realisations", requireAuth, async (req, res) => {
    try {
      const participantId = req.auth?.user?.participantId;
      if (!participantId) return res.status(403).json({ error: "Compte non relié à un grimpeur" });
      const realisation = validateRealisationPayload({
        ...(req.body || {}),
        participantId: String(participantId),
      });
      realisation.participantId = String(participantId);
      realisation.videoUrls = normalizeVideoUrls(req.body?.videoUrls) || [];
      await assertRealisationIntegrity({ pool, realisation, participantId });
      await assertVideoUrlsBelongToRoute(pool, realisation.voieId, realisation.videoUrls);

      await pool.query(
        `
          insert into realisations (
            id, participant_id, session_id, voie_id, date_realisation, style_realisation,
            commentaire, cotation_proposee, nb_essais, rating, chute, assureur_id, video_urls
          ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
        `,
        [
          realisation.id, realisation.participantId, realisation.sessionId, realisation.voieId,
          realisation.dateRealisation, realisation.styleRealisation, realisation.commentaire || "",
          realisation.cotationProposee || "", realisation.nbEssais || "", realisation.rating ?? null,
          Boolean(realisation.chute), realisation.assureurId || null, JSON.stringify(realisation.videoUrls),
        ],
      );
      res.json(realisation);
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message || String(error), fields: error.fields || undefined });
    }
  });

  // Compatibilité avec les anciens clients. Les nouveaux écrans Profil utilisent
  // le transfert fractionné ci-dessous pour traverser les proxies limités à 1 Mo.
  app.post(
    "/realisations/:id/videos",
    requireAuth,
    express.raw({ type: ["video/*", "application/octet-stream"], limit: LOCAL_VIDEO_MAX_BYTES }),
    async (req, res) => {
      const participantId = req.auth?.user?.participantId;
      if (!participantId) return res.status(403).json({ error: "Compte non relié à un grimpeur" });

      const mimeType = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
      if (!LOCAL_VIDEO_TYPES.has(mimeType)) {
        return res.status(400).json({ error: "Format vidéo refusé. Utilisez MP4, WebM, OGG ou MOV." });
      }
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ error: "Fichier vidéo vide." });
      }
      if (req.body.length > LOCAL_VIDEO_MAX_BYTES) {
        return res.status(413).json({ error: "Vidéo trop volumineuse. Maximum 50 Mo." });
      }

      let client;
      try {
        await ensureVideoSchema();
        client = await pool.connect();
        await client.query("begin");
        const result = await persistRealisationVideo({
          client,
          participantId,
          realisationId: req.params.id,
          content: req.body,
          mimeType,
          fileName: decodeVideoFileName(req.headers["x-file-name"]),
          authUserId: req.auth?.user?.id,
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        });
        await client.query("commit");
        return res.status(201).json(result);
      } catch (error) {
        if (client) {
          try { await client.query("rollback"); } catch { /* transaction déjà terminée */ }
        }
        return res.status(error.status || 500).json({ error: error.message || "Chargement de la vidéo impossible." });
      } finally {
        client?.release();
      }
    },
  );

  app.post(
    "/realisations/:id/video-uploads/:uploadId/chunks/:partNumber",
    requireAuth,
    express.raw({ type: "application/octet-stream", limit: VIDEO_UPLOAD_CHUNK_MAX_BYTES }),
    async (req, res) => {
      const participantId = req.auth?.user?.participantId;
      if (!participantId) return res.status(403).json({ error: "Compte non relié à un grimpeur" });

      const uploadId = String(req.params.uploadId || "");
      const partNumber = Number.parseInt(String(req.params.partNumber || ""), 10);
      const totalParts = parseIntegerHeader(req, "x-total-parts");
      const totalBytes = parseIntegerHeader(req, "x-total-bytes");
      const mimeType = String(req.headers["x-video-mime-type"] || "").trim().toLowerCase();
      const fileName = decodeVideoFileName(req.headers["x-file-name"]);

      if (!VIDEO_UPLOAD_ID_PATTERN.test(uploadId)) {
        return res.status(400).json({ error: "Identifiant de transfert vidéo invalide." });
      }
      if (!Number.isInteger(totalParts) || totalParts < 1 || totalParts > VIDEO_UPLOAD_MAX_PARTS) {
        return res.status(400).json({ error: "Nombre de blocs vidéo invalide." });
      }
      if (!Number.isInteger(partNumber) || partNumber < 0 || partNumber >= totalParts) {
        return res.status(400).json({ error: "Numéro de bloc vidéo invalide." });
      }
      if (!Number.isInteger(totalBytes) || totalBytes < 1 || totalBytes > LOCAL_VIDEO_MAX_BYTES) {
        return res.status(400).json({ error: "Taille totale de vidéo invalide." });
      }
      if (!LOCAL_VIDEO_TYPES.has(mimeType)) {
        return res.status(400).json({ error: "Format vidéo refusé. Utilisez MP4, WebM, OGG ou MOV." });
      }
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ error: "Bloc vidéo vide." });
      }
      if (req.body.length > VIDEO_UPLOAD_CHUNK_MAX_BYTES) {
        return res.status(413).json({ error: "Bloc vidéo trop volumineux." });
      }

      try {
        await ensureVideoSchema();
        await pool.query(`delete from route_video_upload_chunks where created_at < now() - interval '24 hours'`);

        const realisationResult = await pool.query(
          `select voie_id, video_urls from realisations where id = $1 and participant_id = $2 limit 1`,
          [req.params.id, participantId],
        );
        if (!realisationResult.rowCount) {
          return res.status(403).json({ error: "Cette réalisation ne vous appartient pas" });
        }
        const realisation = realisationResult.rows[0];
        const currentUrls = Array.isArray(realisation.video_urls) ? realisation.video_urls : [];
        if (currentUrls.length >= 3) {
          return res.status(400).json({ error: "Trois vidéos maximum peuvent être associées à une réalisation." });
        }

        const previous = await pool.query(
          `
            select realisation_id, route_id, file_name, mime_type, total_parts, total_bytes
            from route_video_upload_chunks
            where participant_id = $1 and upload_id = $2
            limit 1
          `,
          [participantId, uploadId],
        );
        if (previous.rowCount) {
          const existing = previous.rows[0];
          const metadataMatches = String(existing.realisation_id) === String(req.params.id)
            && String(existing.route_id) === String(realisation.voie_id)
            && String(existing.file_name) === fileName
            && String(existing.mime_type) === mimeType
            && Number(existing.total_parts) === totalParts
            && Number(existing.total_bytes) === totalBytes;
          if (!metadataMatches) {
            return res.status(409).json({ error: "Les paramètres de ce transfert vidéo ont changé." });
          }
        }

        await pool.query(
          `
            insert into route_video_upload_chunks (
              participant_id, upload_id, part_number, realisation_id, route_id,
              file_name, mime_type, total_parts, total_bytes, content, created_at
            ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
            on conflict (participant_id, upload_id, part_number)
            do update set content = excluded.content, created_at = now()
          `,
          [
            participantId, uploadId, partNumber, req.params.id, realisation.voie_id,
            fileName, mimeType, totalParts, totalBytes, req.body,
          ],
        );
        return res.status(201).json({ ok: true, partNumber, receivedBytes: req.body.length });
      } catch (error) {
        return res.status(error.status || 500).json({ error: error.message || "Chargement du bloc vidéo impossible." });
      }
    },
  );

  app.post("/realisations/:id/video-uploads/:uploadId/complete", requireAuth, async (req, res) => {
    const participantId = req.auth?.user?.participantId;
    if (!participantId) return res.status(403).json({ error: "Compte non relié à un grimpeur" });

    const uploadId = String(req.params.uploadId || "");
    if (!VIDEO_UPLOAD_ID_PATTERN.test(uploadId)) {
      return res.status(400).json({ error: "Identifiant de transfert vidéo invalide." });
    }

    let client;
    try {
      await ensureVideoSchema();
      client = await pool.connect();
      await client.query("begin");

      const chunksResult = await client.query(
        `
          select part_number, realisation_id, route_id, file_name, mime_type, total_parts, total_bytes, content
          from route_video_upload_chunks
          where participant_id = $1 and upload_id = $2 and realisation_id = $3
          order by part_number asc
          for update
        `,
        [participantId, uploadId, req.params.id],
      );
      if (!chunksResult.rowCount) {
        const error = new Error("Aucun bloc vidéo reçu pour ce transfert.");
        error.status = 400;
        throw error;
      }

      const first = chunksResult.rows[0];
      const totalParts = Number(first.total_parts);
      const totalBytes = Number(first.total_bytes);
      if (totalParts < 1 || totalParts > VIDEO_UPLOAD_MAX_PARTS || chunksResult.rowCount !== totalParts) {
        const error = new Error("Le transfert vidéo est incomplet.");
        error.status = 409;
        throw error;
      }

      let receivedBytes = 0;
      const buffers = [];
      for (let index = 0; index < chunksResult.rows.length; index += 1) {
        const chunk = chunksResult.rows[index];
        const consistent = Number(chunk.part_number) === index
          && String(chunk.realisation_id) === String(req.params.id)
          && String(chunk.route_id) === String(first.route_id)
          && String(chunk.file_name) === String(first.file_name)
          && String(chunk.mime_type) === String(first.mime_type)
          && Number(chunk.total_parts) === totalParts
          && Number(chunk.total_bytes) === totalBytes;
        if (!consistent) {
          const error = new Error("Les blocs de la vidéo ne sont pas cohérents.");
          error.status = 409;
          throw error;
        }
        const buffer = Buffer.isBuffer(chunk.content) ? chunk.content : Buffer.from(chunk.content || []);
        receivedBytes += buffer.length;
        buffers.push(buffer);
      }
      if (receivedBytes !== totalBytes || receivedBytes > LOCAL_VIDEO_MAX_BYTES) {
        const error = new Error("La taille de la vidéo assemblée est invalide.");
        error.status = 409;
        throw error;
      }
      if (!LOCAL_VIDEO_TYPES.has(String(first.mime_type))) {
        const error = new Error("Format vidéo refusé. Utilisez MP4, WebM, OGG ou MOV.");
        error.status = 400;
        throw error;
      }

      const content = Buffer.concat(buffers, receivedBytes);
      const result = await persistRealisationVideo({
        client,
        participantId,
        realisationId: req.params.id,
        content,
        mimeType: String(first.mime_type),
        fileName: String(first.file_name),
        authUserId: req.auth?.user?.id,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });
      await client.query(
        `delete from route_video_upload_chunks where participant_id = $1 and upload_id = $2`,
        [participantId, uploadId],
      );
      await client.query("commit");
      return res.status(201).json(result);
    } catch (error) {
      if (client) {
        try { await client.query("rollback"); } catch { /* transaction déjà terminée */ }
      }
      return res.status(error.status || 500).json({ error: error.message || "Assemblage de la vidéo impossible." });
    } finally {
      client?.release();
    }
  });

  app.delete("/realisations/:id/videos/:videoId", requireAuth, async (req, res) => {
    const participantId = req.auth?.user?.participantId;
    if (!participantId) return res.status(403).json({ error: "Compte non relié à un grimpeur" });

    let client;
    try {
      await ensureVideoSchema();
      client = await pool.connect();
      await client.query("begin");

      const realisationResult = await client.query(
        `
          select voie_id, video_urls
          from realisations
          where id = $1 and participant_id = $2
          for update
        `,
        [req.params.id, participantId],
      );
      if (!realisationResult.rowCount) {
        await client.query("rollback");
        return res.status(403).json({ error: "Cette réalisation ne vous appartient pas" });
      }

      const realisation = realisationResult.rows[0];
      const routeId = String(realisation.voie_id);
      const url = `/routes/${encodeURIComponent(routeId)}/videos/${req.params.videoId}`;
      const currentUrls = Array.isArray(realisation.video_urls) ? realisation.video_urls.map(String) : [];
      if (!currentUrls.includes(url)) {
        await client.query("rollback");
        return res.status(404).json({ error: "Cette vidéo n’est pas associée à la réalisation" });
      }

      const nextUrls = currentUrls.filter((item) => item !== url);
      await client.query(
        `update realisations set video_urls = $3::jsonb, updated_at = now() where id = $1 and participant_id = $2`,
        [req.params.id, participantId, JSON.stringify(nextUrls)],
      );

      const sourceVideo = await client.query(
        `
          select file_name
          from route_videos
          where id = $1 and route_id = $2 and source_realisation_id = $3
          for update
        `,
        [req.params.videoId, routeId, req.params.id],
      );

      let deletedPermanently = false;
      if (sourceVideo.rowCount) {
        const otherReferences = await client.query(
          `
            select 1
            from realisations
            where id <> $1 and video_urls ? $2
            limit 1
          `,
          [req.params.id, url],
        );
        if (!otherReferences.rowCount) {
          await client.query(
            `delete from route_videos where id = $1 and route_id = $2 and source_realisation_id = $3`,
            [req.params.videoId, routeId, req.params.id],
          );
          await client.query(
            `update routes set video_urls = array_remove(video_urls, $2), updated_at = now() where id = $1`,
            [routeId, url],
          );
          deletedPermanently = true;
        }
      }

      await client.query(
        `
          insert into access_logs (user_id, event_type, success, ip_address, user_agent, details)
          values ($1, 'realisation_video_delete', true, $2, $3, $4::jsonb)
        `,
        [
          req.auth?.user?.id || null,
          req.ip || null,
          req.headers["user-agent"] || null,
          JSON.stringify({
            realisation_id: req.params.id,
            route_id: routeId,
            video_id: req.params.videoId,
            deleted_permanently: deletedPermanently,
          }),
        ],
      );

      await client.query("commit");
      return res.json({ ok: true, videoUrls: nextUrls, deletedPermanently });
    } catch (error) {
      if (client) {
        try { await client.query("rollback"); } catch { /* transaction déjà terminée */ }
      }
      return res.status(error.status || 500).json({ error: error.message || "Suppression de la vidéo impossible." });
    } finally {
      client?.release();
    }
  });

  app.put("/realisations/:id", requireAuth, async (req, res) => {
    try {
      const participantId = req.auth?.user?.participantId;
      if (!participantId) return res.status(403).json({ error: "Compte non relié à un grimpeur" });
      const patch = validateRealisationPayload(req.body || {}, { partial: true });
      delete patch.participantId;

      const currentResult = await pool.query(
        `
          select session_id, voie_id, date_realisation, chute, assureur_id, video_urls
          from realisations
          where id = $1 and participant_id = $2
          limit 1
        `,
        [req.params.id, participantId],
      );
      if (currentResult.rowCount === 0) {
        return res.status(403).json({ error: "Cette réalisation ne vous appartient pas" });
      }

      const current = currentResult.rows[0];
      const candidate = rowToIntegrityCandidate(current, patch, participantId);
      await assertRealisationIntegrity({ pool, realisation: candidate, participantId });

      let videoUrlsForUpdate = null;
      if (req.body?.videoUrls !== undefined) {
        videoUrlsForUpdate = normalizeVideoUrls(req.body.videoUrls);
        await assertVideoUrlsBelongToRoute(pool, candidate.voieId, videoUrlsForUpdate);
      } else if (patch.voieId !== undefined && String(patch.voieId) !== String(current.voie_id)) {
        videoUrlsForUpdate = [];
      }

      const result = await pool.query(
        `
          update realisations
          set
            session_id = coalesce($2, session_id),
            voie_id = coalesce($3, voie_id),
            date_realisation = coalesce($4, date_realisation),
            style_realisation = coalesce($5, style_realisation),
            commentaire = coalesce($6, commentaire),
            cotation_proposee = coalesce($7, cotation_proposee),
            nb_essais = coalesce($8, nb_essais),
            rating = coalesce($9, rating),
            chute = coalesce($10, chute),
            assureur_id = case when $10 = false then null else coalesce($11, assureur_id) end,
            video_urls = case when $12::jsonb is null then video_urls else $12::jsonb end,
            updated_at = now()
          where id = $1 and participant_id = $13
        `,
        [
          req.params.id, patch.sessionId ?? null, patch.voieId ?? null, patch.dateRealisation ?? null,
          patch.styleRealisation ?? null, patch.commentaire ?? null, patch.cotationProposee ?? null,
          patch.nbEssais ?? null, patch.rating ?? null, patch.chute ?? null, patch.assureurId ?? null,
          videoUrlsForUpdate === null ? null : JSON.stringify(videoUrlsForUpdate), participantId,
        ],
      );
      if (result.rowCount === 0) return res.status(403).json({ error: "Cette réalisation ne vous appartient pas" });
      res.json({ ok: true, videoUrls: videoUrlsForUpdate });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message || String(error), fields: error.fields || undefined });
    }
  });

  app.delete("/realisations/:id", requireAuth, async (req, res) => {
    try {
      const participantId = req.auth?.user?.participantId;
      if (!participantId) return res.status(403).json({ error: "Compte non relié à un grimpeur" });
      const result = await pool.query(
        `delete from realisations where id = $1 and participant_id = $2`,
        [req.params.id, participantId],
      );
      if (result.rowCount === 0) return res.status(403).json({ error: "Cette réalisation ne vous appartient pas" });
      res.json({ ok: true });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message || String(error), fields: error.fields || undefined });
    }
  });
}
