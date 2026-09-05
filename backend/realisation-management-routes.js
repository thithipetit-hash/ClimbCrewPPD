import crypto from "node:crypto";
import express from "express";
import { validateRealisationPayload } from "./validation.js";
import { assertRealisationIntegrity } from "./realisation-integrity.js";

const LOCAL_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
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
    await pool.query(`create index if not exists idx_route_videos_route on route_videos(route_id)`);
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
        let fileName = "video";
        try {
          fileName = decodeURIComponent(String(req.headers["x-file-name"] || "video"));
        } catch {
          fileName = "video";
        }
        fileName = fileName.replace(/[\r\n]/g, "").slice(0, 180) || "video";
        const url = `/routes/${encodeURIComponent(realisation.voie_id)}/videos/${videoId}`;

        await client.query(
          `insert into route_videos (id, route_id, file_name, mime_type, content) values ($1,$2,$3,$4,$5)`,
          [videoId, realisation.voie_id, fileName, mimeType, req.body],
        );
        const updatedRoute = await client.query(
          `update routes set video_urls = array_append(video_urls, $2), updated_at = now() where id = $1 returning video_urls`,
          [realisation.voie_id, url],
        );
        const nextRealisationUrls = [...currentRealisationUrls, url];
        await client.query(
          `update realisations set video_urls = $3::jsonb, updated_at = now() where id = $1 and participant_id = $2`,
          [req.params.id, participantId, JSON.stringify(nextRealisationUrls)],
        );
        await client.query(
          `
            insert into access_logs (user_id, event_type, success, ip_address, user_agent, details)
            values ($1, 'realisation_video_upload', true, $2, $3, $4::jsonb)
          `,
          [
            req.auth?.user?.id || null,
            req.ip || null,
            req.headers["user-agent"] || null,
            JSON.stringify({
              realisation_id: req.params.id,
              route_id: realisation.voie_id,
              video_id: videoId,
              file_name: fileName,
              size_bytes: req.body.length,
            }),
          ],
        );

        await client.query("commit");
        return res.status(201).json({
          url,
          videoUrls: nextRealisationUrls,
          routeVideoUrls: Array.isArray(updatedRoute.rows[0]?.video_urls)
            ? updatedRoute.rows[0].video_urls.map(String)
            : [...currentRouteUrls, url],
        });
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
