import express from "express";
import crypto from "node:crypto";
import { routeDbToApi } from "./route-serialization.js";
import {
  LOCAL_VIDEO_MAX_BYTES,
  LOCAL_VIDEO_TYPES,
  VIDEO_UPLOAD_CHUNK_MAX_BYTES,
  VIDEO_UPLOAD_ID_PATTERN,
  assertVideoChunkBody,
  cleanupExpiredVideoChunks,
  decodeVideoFileName,
  readVideoChunkRequest,
  validateStoredVideoChunks,
} from "./video-upload-policy.js";

function parseByteRange(rangeHeader, totalLength) {
  const match = String(rangeHeader || "").match(/^bytes=(\d*)-(\d*)$/i);
  if (!match) return null;

  let start;
  let end;
  if (match[1] === "" && match[2] !== "") {
    const suffixLength = Number(match[2]);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(totalLength - suffixLength, 0);
    end = totalLength - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? totalLength - 1 : Number(match[2]);
  }

  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= totalLength) return null;
  return { start, end: Math.min(end, totalLength - 1) };
}

async function loadVideoBytes(pool, routeId, videoId, range = null) {
  const result = range
    ? await pool.query(
      `
        select substring(content from $3 for $4) as content
        from route_videos
        where id = $1 and route_id = $2
        limit 1
      `,
      [videoId, routeId, range.start + 1, range.end - range.start + 1],
    )
    : await pool.query(
      `select content from route_videos where id = $1 and route_id = $2 limit 1`,
      [videoId, routeId],
    );
  if (!result.rowCount) return null;
  const value = result.rows[0].content;
  return Buffer.isBuffer(value) ? value : Buffer.from(value || "");
}

export function installRouteVideoRoutes(app, { requireAuth, requireAdmin, pool }) {
  app.get("/routes/:id/videos/:videoId", requireAuth, async (req, res) => {
    try {
      const result = await pool.query(
        `
          select
            rv.file_name,
            rv.mime_type,
            octet_length(rv.content)::bigint as content_length,
            rv.source_realisation_id,
            re.participant_id as source_participant_id,
            coalesce(p.profile_public, false) as source_profile_public
          from route_videos rv
          left join realisations re on re.id = rv.source_realisation_id
          left join participants p on p.id::text = re.participant_id::text
          where rv.id = $1 and rv.route_id = $2
          limit 1
        `,
        [req.params.videoId, req.params.id],
      );
      if (!result.rowCount) return res.status(404).json({ error: "Vidéo introuvable" });

      const video = result.rows[0];
      if (video.source_realisation_id) {
        const requesterParticipantId = String(req.auth?.user?.participantId || "");
        const sourceParticipantId = String(video.source_participant_id || "");
        const canReadPersonalVideo = Boolean(sourceParticipantId) && (
          req.auth?.user?.role === "admin"
          || requesterParticipantId === sourceParticipantId
          || video.source_profile_public === true
        );
        if (!canReadPersonalVideo) {
          return res.status(404).json({ error: "Vidéo introuvable" });
        }
      }

      const totalLength = Number(video.content_length || 0);
      if (!Number.isSafeInteger(totalLength) || totalLength < 0) {
        throw new Error("Taille de vidéo invalide");
      }
      const disposition = req.query.download === "1" ? "attachment" : "inline";

      res.setHeader("Content-Type", video.mime_type);
      res.setHeader("Content-Disposition", `${disposition}; filename*=UTF-8''${encodeURIComponent(video.file_name)}`);
      res.setHeader(
        "Cache-Control",
        video.source_realisation_id ? "private, no-store" : "private, max-age=3600",
      );
      res.setHeader("Accept-Ranges", "bytes");

      if (req.query.download === "1" || !req.headers.range) {
        const content = await loadVideoBytes(pool, req.params.id, req.params.videoId);
        if (content === null) return res.status(404).json({ error: "Vidéo introuvable" });
        res.setHeader("Content-Length", String(totalLength));
        return res.status(200).send(content);
      }

      const range = parseByteRange(req.headers.range, totalLength);
      if (!range) {
        res.setHeader("Content-Range", `bytes */${totalLength}`);
        return res.status(416).end();
      }

      const chunk = await loadVideoBytes(pool, req.params.id, req.params.videoId, range);
      if (chunk === null) return res.status(404).json({ error: "Vidéo introuvable" });
      res.status(206);
      res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${totalLength}`);
      res.setHeader("Content-Length", String(chunk.length));
      return res.send(chunk);
    } catch (error) {
      console.error("GET /routes/:id/videos/:videoId", error);
      return res.status(500).json({ error: "Lecture de la vidéo impossible" });
    }
  });

  app.post(
    "/routes/:id/video-uploads/:uploadId/chunks/:partNumber",
    requireAuth, requireAdmin,
    express.raw({ type: "application/octet-stream", limit: VIDEO_UPLOAD_CHUNK_MAX_BYTES }),
    async (req, res) => {
      try {
        const { uploadId, partNumber, totalParts, totalBytes, mimeType, fileName } = readVideoChunkRequest(req);
        assertVideoChunkBody(req.body);
        await cleanupExpiredVideoChunks(pool);
        const route = await pool.query("select video_urls from routes where id=$1", [req.params.id]);
        if (!route.rowCount) return res.status(404).json({ error: "Voie introuvable" });
        if ((route.rows[0].video_urls || []).length >= 10) return res.status(400).json({ error: "10 vidéos maximum par voie." });

        const ownerKey = `admin:${req.auth?.user?.id || "unknown"}`;
        const previous = await pool.query(
          `select realisation_id, route_id, file_name, mime_type, total_parts, total_bytes
           from route_video_upload_chunks where participant_id=$1 and upload_id=$2 limit 1`,
          [ownerKey, uploadId],
        );
        if (previous.rowCount) {
          const existing = previous.rows[0];
          const metadataMatches = String(existing.realisation_id) === `route:${req.params.id}`
            && String(existing.route_id) === String(req.params.id)
            && String(existing.file_name) === fileName
            && String(existing.mime_type) === mimeType
            && Number(existing.total_parts) === totalParts
            && Number(existing.total_bytes) === totalBytes;
          if (!metadataMatches) return res.status(409).json({ error: "Les paramètres de ce transfert vidéo ont changé." });
        }

        await pool.query(
          `insert into route_video_upload_chunks
           (participant_id,upload_id,part_number,realisation_id,route_id,file_name,mime_type,total_parts,total_bytes,content,created_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
           on conflict (participant_id,upload_id,part_number) do update set content=excluded.content,created_at=now()`,
          [ownerKey,uploadId,partNumber,`route:${req.params.id}`,req.params.id,fileName,mimeType,totalParts,totalBytes,req.body]
        );
        res.status(201).json({ ok:true, partNumber });
      } catch (error) {
        res.status(error.status || 500).json({ error: error.message || "Chargement du bloc impossible." });
      }
    }
  );

  app.post("/routes/:id/video-uploads/:uploadId/complete", requireAuth, requireAdmin, async (req,res) => {
    const key = `admin:${req.auth?.user?.id || "unknown"}`;
    const uploadId = String(req.params.uploadId || "");
    if (!VIDEO_UPLOAD_ID_PATTERN.test(uploadId)) {
      return res.status(400).json({ error: "Identifiant de transfert vidéo invalide." });
    }
    const client=await pool.connect();
    try {
      await client.query("begin");
      const chunks=await client.query(
        `select part_number,realisation_id,route_id,file_name,mime_type,total_parts,total_bytes,octet_length(content)::integer content_bytes
         from route_video_upload_chunks where participant_id=$1 and upload_id=$2 and route_id=$3 order by part_number for update`,
        [key,uploadId,req.params.id]
      );
      const { first } = validateStoredVideoChunks(chunks.rows, { expectedRouteId: req.params.id });
      const assembled=await client.query(
        `select string_agg(content,''::bytea order by part_number) content from route_video_upload_chunks where participant_id=$1 and upload_id=$2 and route_id=$3`,
        [key,uploadId,req.params.id]
      );
      const raw=assembled.rows[0]?.content, content=Buffer.isBuffer(raw)?raw:Buffer.from(raw||[]);
      const videoId=crypto.randomUUID(), url=`/routes/${encodeURIComponent(req.params.id)}/videos/${videoId}`;
      await client.query("insert into route_videos(id,route_id,file_name,mime_type,content) values($1,$2,$3,$4,$5)",[videoId,req.params.id,first.file_name,first.mime_type,content]);
      const updated=await client.query("update routes set video_urls=array_append(video_urls,$2),updated_at=now() where id=$1 returning *",[req.params.id,url]);
      await client.query("delete from route_video_upload_chunks where participant_id=$1 and upload_id=$2",[key,uploadId]);
      await client.query("commit");
      res.status(201).json({url,route:routeDbToApi(updated.rows[0])});
    } catch(error) {
      try { await client.query("rollback"); } catch {}
      res.status(error.status||500).json({error:error.message||"Assemblage vidéo impossible."});
    } finally { client.release(); }
  });

  app.post(
    "/routes/:id/videos",
    requireAuth,
    requireAdmin,
    express.raw({ type: ["video/*", "application/octet-stream"], limit: LOCAL_VIDEO_MAX_BYTES }),
    async (req, res) => {
      try {
        const mimeType = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
        if (!LOCAL_VIDEO_TYPES.has(mimeType)) return res.status(400).json({ error: "Format vidéo refusé. Utilisez MP4, WebM, OGG ou MOV." });
        if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: "Fichier vidéo vide." });
        if (req.body.length > LOCAL_VIDEO_MAX_BYTES) return res.status(413).json({ error: "Vidéo trop volumineuse. Maximum 50 Mo." });

        const routeResult = await pool.query(`select video_urls from routes where id = $1`, [req.params.id]);
        if (!routeResult.rowCount) return res.status(404).json({ error: "Voie introuvable" });
        const currentUrls = Array.isArray(routeResult.rows[0].video_urls) ? routeResult.rows[0].video_urls : [];
        if (currentUrls.length >= 10) return res.status(400).json({ error: "10 vidéos maximum par voie." });

        const videoId = crypto.randomUUID();
        const fileName = decodeVideoFileName(req.headers["x-file-name"]);
        const url = `/routes/${encodeURIComponent(req.params.id)}/videos/${videoId}`;
        const sizeBytes = req.body.length;

        const client = await pool.connect();
        try {
          await client.query("begin");
          await client.query(
            `insert into route_videos (id, route_id, file_name, mime_type, content) values ($1,$2,$3,$4,$5)`,
            [videoId, req.params.id, fileName, mimeType, req.body],
          );
          const updated = await client.query(
            `update routes set video_urls = array_append(video_urls, $2), updated_at = now() where id = $1 returning *`,
            [req.params.id, url],
          );
          await client.query(
            `
              insert into access_logs (user_id, event_type, success, ip_address, user_agent, details)
              values ($1, 'route_video_upload', true, $2, $3, $4::jsonb)
            `,
            [
              req.auth?.user?.id || null,
              req.ip || null,
              req.headers["user-agent"] || null,
              JSON.stringify({
                route_id: req.params.id,
                video_id: videoId,
                file_name: fileName,
                size_bytes: sizeBytes,
                size_mb: Number((sizeBytes / (1024 * 1024)).toFixed(2)),
                mime_type: mimeType,
              }),
            ],
          );
          await client.query("commit");
          return res.status(201).json({ url, route: routeDbToApi(updated.rows[0]) });
        } catch (error) {
          await client.query("rollback");
          throw error;
        } finally {
          client.release();
        }
      } catch (error) {
        console.error("POST /routes/:id/videos", error);
        return res.status(error.type === "entity.too.large" ? 413 : 500).json({ error: error.message || "Chargement de la vidéo impossible" });
      }
    },
  );

  app.delete("/routes/:id/videos/:videoId", requireAuth, requireAdmin, async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const deleted = await client.query(
        `delete from route_videos where id = $1 and route_id = $2 returning file_name`,
        [req.params.videoId, req.params.id],
      );
      if (!deleted.rowCount) {
        await client.query("rollback");
        return res.status(404).json({ error: "Vidéo introuvable" });
      }

      const url = `/routes/${encodeURIComponent(req.params.id)}/videos/${req.params.videoId}`;
      const updated = await client.query(
        `update routes set video_urls = array_remove(video_urls, $2), updated_at = now() where id = $1 returning *`,
        [req.params.id, url],
      );
      if (!updated.rowCount) {
        await client.query("rollback");
        return res.status(404).json({ error: "Voie introuvable" });
      }

      await client.query(
        `
          insert into access_logs (user_id, event_type, success, ip_address, user_agent, details)
          values ($1, 'route_video_delete', true, $2, $3, $4::jsonb)
        `,
        [
          req.auth?.user?.id || null,
          req.ip || null,
          req.headers["user-agent"] || null,
          JSON.stringify({
            route_id: req.params.id,
            video_id: req.params.videoId,
            file_name: deleted.rows[0].file_name,
          }),
        ],
      );
      await client.query("commit");
      return res.json({ ok: true, route: routeDbToApi(updated.rows[0]) });
    } catch (error) {
      await client.query("rollback");
      console.error("DELETE /routes/:id/videos/:videoId", error);
      return res.status(500).json({ error: error.message || "Suppression de la vidéo impossible" });
    } finally {
      client.release();
    }
  });
}
