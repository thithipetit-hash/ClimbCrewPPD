const MAX_TECHNICAL_ANALYSIS_BYTES = 128 * 1024;
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

function normalizeAnalysis(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw badRequest("Le résultat d’analyse technique est invalide.");
  }
  if (!value.metrics || typeof value.metrics !== "object" || Array.isArray(value.metrics)) {
    throw badRequest("Les mesures de l’analyse technique sont absentes.");
  }
  if (value.recommendations !== undefined && !Array.isArray(value.recommendations)) {
    throw badRequest("Les recommandations de l’analyse technique sont invalides.");
  }

  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw badRequest("Le résultat d’analyse technique ne peut pas être enregistré.");
  }
  if (!serialized || Buffer.byteLength(serialized, "utf8") > MAX_TECHNICAL_ANALYSIS_BYTES) {
    throw badRequest("Le résultat d’analyse technique est trop volumineux.");
  }

  const cloned = JSON.parse(serialized);
  return {
    ...cloned,
    engine: String(cloned.engine || "").slice(0, 120),
    engineVersion: String(cloned.engineVersion || "").slice(0, 40),
    analyzedAt: new Date().toISOString(),
    storageVersion: 1,
  };
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
  app.put("/realisations/:id/technical-analysis", requireAuth, async (req, res) => {
    const participantId = req.auth?.user?.participantId;
    if (!participantId) {
      return res.status(403).json({ error: "Compte non relié à un grimpeur" });
    }

    let client;
    try {
      const videoUrl = normalizeVideoUrl(req.body?.videoUrl);
      const analysis = normalizeAnalysis(req.body?.analysis);
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
