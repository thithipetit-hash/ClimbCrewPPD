import express from "express";
import crypto from "node:crypto";
import { validateRoutePayload } from "./validation.js";

const LOCAL_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
const LOCAL_VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/ogg", "video/quicktime"]);

function ropeDbToApi(row) {
  return {
    numeroCorde: Number(row.numero_corde),
    actif: Boolean(row.actif),
    couleurCorde: row.couleur_corde || "",
  };
}

function normalizeVideoUrls(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    const error = new Error("videoUrls doit être un tableau.");
    error.status = 400;
    throw error;
  }

  const urls = [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))];
  if (urls.length > 10) {
    const error = new Error("Une voie ne peut avoir que 10 vidéos maximum.");
    error.status = 400;
    throw error;
  }

  for (const url of urls) {
    if (url.length > 1000) {
      const error = new Error("Une URL de vidéo est trop longue.");
      error.status = 400;
      throw error;
    }
    if (/^\/routes\/[^/]+\/videos\/[^/]+$/.test(url)) continue;
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      const error = new Error(`URL de vidéo invalide : ${url}`);
      error.status = 400;
      throw error;
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      const error = new Error("Les liens vidéo doivent utiliser http ou https.");
      error.status = 400;
      throw error;
    }
  }

  return urls;
}

function routeDbToApi(row) {
  return {
    id: row.id,
    numeroVoieUnique: row.numero_voie_unique,
    numeroCorde: row.numero_corde === null ? null : Number(row.numero_corde),
    couleurPrises: row.couleur_prises || "",
    cotationReference: row.cotation_reference || "",
    cotationAjustee: row.cotation_ajustee || row.cotation_reference || "",
    nomVoie: row.nom_voie || "",
    nomOuvreur: row.nom_ouvreur || "",
    moulinetteOnly: Boolean(row.moulinette_only),
    tags: Array.isArray(row.tags) ? row.tags : [],
    videoUrls: Array.isArray(row.video_urls) ? row.video_urls : [],
    active: Boolean(row.active),
    dateCreation: row.date_creation || "",
    ratingAverage: Number(row.rating_average || 0),
    ratingCount: Number(row.rating_count || 0),
  };
}

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

export function installRouteManagementRoutes(app, { requireAuth, requireAdmin, pool }) {
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

  app.get("/ropes", requireAuth, async (_req, res) => {
    try {
      const result = await pool.query(`select numero_corde, actif, couleur_corde from ropes order by numero_corde asc`);
      res.json(result.rows.map(ropeDbToApi));
    } catch (error) {
      console.error("GET /ropes", error);
      res.status(500).json({ error: "Erreur chargement cordes" });
    }
  });

  app.get("/routes", requireAuth, async (_req, res) => {
    try {
      await ensureVideoSchema();
      const result = await pool.query(`
        select r.*, coalesce(avg(re.rating), 0)::float as rating_average, count(re.rating)::integer as rating_count
        from routes r
        left join realisations re on re.voie_id = r.id
        group by r.id
        order by r.numero_corde asc nulls last, r.numero_voie_unique asc
      `);
      res.json(result.rows.map(routeDbToApi));
    } catch (error) {
      console.error("GET /routes", error);
      res.status(500).json({ error: "Erreur chargement voies" });
    }
  });

  app.get("/routes/:id/videos/:videoId", requireAuth, async (req, res) => {
    try {
      await ensureVideoSchema();
      const result = await pool.query(
        `select file_name, mime_type, content from route_videos where id = $1 and route_id = $2`,
        [req.params.videoId, req.params.id],
      );
      if (!result.rowCount) return res.status(404).json({ error: "Vidéo introuvable" });

      const video = result.rows[0];
      const content = Buffer.isBuffer(video.content) ? video.content : Buffer.from(video.content || "");
      const totalLength = content.length;
      const disposition = req.query.download === "1" ? "attachment" : "inline";

      res.setHeader("Content-Type", video.mime_type);
      res.setHeader("Content-Disposition", `${disposition}; filename*=UTF-8''${encodeURIComponent(video.file_name)}`);
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.setHeader("Accept-Ranges", "bytes");

      if (req.query.download === "1") {
        res.setHeader("Content-Length", String(totalLength));
        return res.status(200).send(content);
      }

      const rangeHeader = req.headers.range;
      if (!rangeHeader) {
        res.setHeader("Content-Length", String(totalLength));
        return res.status(200).send(content);
      }

      const range = parseByteRange(rangeHeader, totalLength);
      if (!range) {
        res.setHeader("Content-Range", `bytes */${totalLength}`);
        return res.status(416).end();
      }

      const chunk = content.subarray(range.start, range.end + 1);
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
    "/routes/:id/videos",
    requireAuth,
    requireAdmin,
    express.raw({ type: ["video/*", "application/octet-stream"], limit: LOCAL_VIDEO_MAX_BYTES }),
    async (req, res) => {
      try {
        await ensureVideoSchema();
        const mimeType = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
        if (!LOCAL_VIDEO_TYPES.has(mimeType)) return res.status(400).json({ error: "Format vidéo refusé. Utilisez MP4, WebM, OGG ou MOV." });
        if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: "Fichier vidéo vide." });
        if (req.body.length > LOCAL_VIDEO_MAX_BYTES) return res.status(413).json({ error: "Vidéo trop volumineuse. Maximum 50 Mo." });

        const routeResult = await pool.query(`select video_urls from routes where id = $1`, [req.params.id]);
        if (!routeResult.rowCount) return res.status(404).json({ error: "Voie introuvable" });
        const currentUrls = Array.isArray(routeResult.rows[0].video_urls) ? routeResult.rows[0].video_urls : [];
        if (currentUrls.length >= 10) return res.status(400).json({ error: "10 vidéos maximum par voie." });

        const videoId = crypto.randomUUID();
        let fileName = "video";
        try { fileName = decodeURIComponent(String(req.headers["x-file-name"] || "video")); } catch { fileName = "video"; }
        fileName = fileName.replace(/[\r\n]/g, "").slice(0, 180) || "video";
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

  app.post("/routes", requireAuth, requireAdmin, async (req, res) => {
    try {
      await ensureVideoSchema();
      const requestedRoute = req.body || {};
      const id = requestedRoute.id || `route-${Date.now()}`;
      const route = validateRoutePayload({ ...requestedRoute, id, numeroVoieUnique: requestedRoute.numeroVoieUnique || id });
      route.videoUrls = normalizeVideoUrls(requestedRoute.videoUrls) || [];
      const result = await pool.query(`
        insert into routes (
          id, numero_voie_unique, numero_corde, couleur_prises, cotation_reference,
          cotation_ajustee, nom_voie, nom_ouvreur, moulinette_only, active, date_creation, tags, video_urls
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning *
      `, [
        id,
        String(route.numeroVoieUnique || "").trim(),
        route.numeroCorde === undefined || route.numeroCorde === null || route.numeroCorde === "" ? null : Number(route.numeroCorde),
        String(route.couleurPrises || "").trim(),
        String(route.cotationReference || "").trim(),
        String(route.cotationAjustee || route.cotationReference || "").trim(),
        String(route.nomVoie || "").trim(),
        String(route.nomOuvreur || "").trim(),
        Boolean(route.moulinetteOnly),
        route.active !== false,
        String(route.dateCreation || "").trim(),
        route.tags || [],
        route.videoUrls,
      ]);
      res.status(201).json(routeDbToApi(result.rows[0]));
    } catch (error) {
      console.error("POST /routes", error);
      res.status(error.status || 500).json({ error: error.message || "Erreur création voie", fields: error.fields || undefined });
    }
  });

  app.put("/routes/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      await ensureVideoSchema();
      const route = validateRoutePayload(req.body || {}, { partial: true });
      route.videoUrls = normalizeVideoUrls(req.body?.videoUrls);
      const result = await pool.query(`
        update routes set
          numero_voie_unique = coalesce($2, numero_voie_unique),
          numero_corde = coalesce($3, numero_corde),
          couleur_prises = coalesce($4, couleur_prises),
          cotation_reference = coalesce($5, cotation_reference),
          cotation_ajustee = coalesce($6, cotation_ajustee),
          nom_voie = coalesce($7, nom_voie),
          nom_ouvreur = coalesce($8, nom_ouvreur),
          moulinette_only = coalesce($9, moulinette_only),
          active = coalesce($10, active),
          date_creation = coalesce($11, date_creation),
          tags = coalesce($12, tags),
          video_urls = coalesce($13, video_urls),
          updated_at = now()
        where id = $1 returning *
      `, [
        req.params.id,
        route.numeroVoieUnique ?? null,
        route.numeroCorde === undefined ? null : Number(route.numeroCorde),
        route.couleurPrises ?? null,
        route.cotationReference ?? null,
        route.cotationAjustee ?? null,
        route.nomVoie ?? null,
        route.nomOuvreur ?? null,
        route.moulinetteOnly ?? null,
        route.active ?? null,
        route.dateCreation ?? null,
        route.tags ?? null,
        route.videoUrls ?? null,
      ]);
      if (result.rowCount === 0) return res.status(404).json({ error: "Voie introuvable" });
      res.json(routeDbToApi(result.rows[0]));
    } catch (error) {
      console.error("PUT /routes/:id", error);
      res.status(error.status || 500).json({ error: error.message || "Erreur mise à jour voie", fields: error.fields || undefined });
    }
  });

  app.delete("/routes/:id", requireAuth, requireAdmin, async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const routeResult = await client.query("select id from routes where id = $1 for update", [req.params.id]);
      if (!routeResult.rowCount) {
        await client.query("rollback");
        return res.status(404).json({ error: "Voie introuvable" });
      }
      const realisationsResult = await client.query("delete from realisations where voie_id = $1", [req.params.id]);
      await client.query("delete from routes where id = $1", [req.params.id]);
      await client.query("commit");
      res.json({ ok: true, deletedRealisations: realisationsResult.rowCount });
    } catch (error) {
      await client.query("rollback");
      res.status(500).json({ error: error.message || "Suppression de la voie impossible" });
    } finally {
      client.release();
    }
  });
}
