import { normalizeTechnicalAnalysis } from "./technical-analysis-validation.js";

const LOCAL_VIDEO_URL_PATTERN = /^\/routes\/([^/]+)\/videos\/([^/]+)$/;

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function normalizeVideoUrl(value) {
  const videoUrl = String(value || "").trim();
  if (!videoUrl || videoUrl.length > 2000 || !LOCAL_VIDEO_URL_PATTERN.test(videoUrl)) {
    throw badRequest("La vidéo analysée doit être une vidéo ClimbCrew valide.");
  }
  return videoUrl;
}

function currentAnalysisDocument(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { version: 1, videos: {} };
  }
  const videos = value.videos && typeof value.videos === "object" && !Array.isArray(value.videos)
    ? value.videos
    : {};
  return { ...value, version: 1, videos: { ...videos } };
}

export function installRealisationTechnicalAnalysisRoutes(app, { requireAuth, pool }) {
  app.get("/realisations/:id/technical-analysis", requireAuth, async (req, res) => {
    try {
      const ownParticipantId = String(req.auth?.user?.participantId || "");
      const isAdmin = req.auth?.user?.role === "admin";
      const result = await pool.query(
        `
          select
            r.participant_id,
            r.technical_analysis,
            coalesce(p.profile_public, false) as profile_public
          from realisations r
          left join participants p on p.id::text = r.participant_id::text
          where r.id = $1
          limit 1
        `,
        [req.params.id],
      );
      if (!result.rowCount) return res.status(404).json({ error: "Réalisation introuvable" });

      const row = result.rows[0];
      const canRead = isAdmin
        || String(row.participant_id || "") === ownParticipantId
        || row.profile_public === true;
      if (!canRead) return res.status(404).json({ error: "Réalisation introuvable" });

      return res.json({ technicalAnalysis: currentAnalysisDocument(row.technical_analysis) });
    } catch (error) {
      return res.status(500).json({ error: error.message || "Chargement de l’analyse technique impossible." });
    }
  });

  app.put("/realisations/:id/technical-analysis", requireAuth, async (req, res) => {
    const participantId = req.auth?.user?.participantId;
    if (!participantId) {
      return res.status(403).json({ error: "Compte non relié à un grimpeur" });
    }

    let client;
    try {
      const videoUrl = normalizeVideoUrl(req.body?.videoUrl);
      const analysis = normalizeTechnicalAnalysis(req.body?.analysis);
      const parsedUrl = videoUrl.match(LOCAL_VIDEO_URL_PATTERN);
      const routeIdFromUrl = decodeURIComponent(parsedUrl[1]);

      client = await pool.connect();
      await client.query("begin");

      const result = await client.query(
        `
          select voie_id, video_urls, technical_analysis
          from realisations
          where id = $1 and participant_id = $2
          for update
        `,
        [req.params.id, participantId],
      );
      if (!result.rowCount) {
        const error = new Error("Cette réalisation ne vous appartient pas");
        error.status = 403;
        throw error;
      }

      const realisation = result.rows[0];
      const videoUrls = Array.isArray(realisation.video_urls) ? realisation.video_urls.map(String) : [];
      if (!videoUrls.includes(videoUrl)) {
        throw badRequest("La vidéo analysée n’est plus associée à cette réalisation.");
      }
      if (String(realisation.voie_id) !== String(routeIdFromUrl)) {
        throw badRequest("La vidéo analysée n’appartient pas à la voie de cette réalisation.");
      }

      const document = currentAnalysisDocument(realisation.technical_analysis);
      document.videos[videoUrl] = analysis;

      await client.query(
        `
          update realisations
          set technical_analysis = $3::jsonb, updated_at = now()
          where id = $1 and participant_id = $2
        `,
        [req.params.id, participantId, JSON.stringify(document)],
      );
      await client.query("commit");

      return res.json({ ok: true, analysis, technicalAnalysis: document });
    } catch (error) {
      if (client) {
        try { await client.query("rollback"); } catch { /* transaction déjà terminée */ }
      }
      return res.status(error.status || 500).json({
        error: error.message || "Enregistrement de l’analyse technique impossible.",
      });
    } finally {
      client?.release();
    }
  });
}
