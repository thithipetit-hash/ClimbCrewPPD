import { validateRoutePayload } from "./validation.js";

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

/**
 * Installe les routes de consultation des cordes et de gestion des voies.
 *
 * Ce module est volontairement autonome : server.js ne garde que l'assemblage
 * Express tandis que les règles SQL et la conversion API restent regroupées ici.
 */
export function installRouteManagementRoutes(app, { requireAuth, requireAdmin, pool }) {
  // La migration doit être déclenchée après ensureSchema(), pas au moment où
  // les routes Express sont enregistrées. Lors d'une base neuve, la table
  // routes n'existe pas encore à cet instant.
  let videoSchemaReady = false;
  async function ensureVideoSchema() {
    if (videoSchemaReady) return;
    await pool.query(`
      alter table routes
      add column if not exists video_urls text[] not null default '{}'
    `);
    videoSchemaReady = true;
  }

  app.get("/ropes", requireAuth, async (_req, res) => {
    try {
      const result = await pool.query(`
        select numero_corde, actif, couleur_corde
        from ropes
        order by numero_corde asc
      `);
      res.json(result.rows.map(ropeDbToApi));
    } catch (error) {
      console.error("GET /ropes", error);
      res.status(500).json({ error: "Erreur chargement cordes" });
    }
  });

  app.get("/routes", requireAuth, async (_req, res) => {
    try {
      await ensureVideoSchema();
      const result = await pool.query(
        `
          select
            r.*,
            coalesce(avg(re.rating), 0)::float as rating_average,
            count(re.rating)::integer as rating_count
          from routes r
          left join realisations re on re.voie_id = r.id
          group by r.id
          order by r.numero_corde asc nulls last, r.numero_voie_unique asc
        `,
      );
      res.json(result.rows.map(routeDbToApi));
    } catch (error) {
      console.error("GET /routes", error);
      res.status(500).json({ error: "Erreur chargement voies" });
    }
  });

  app.post("/routes", requireAuth, requireAdmin, async (req, res) => {
    try {
      await ensureVideoSchema();
      const requestedRoute = req.body || {};
      const id = requestedRoute.id || `route-${Date.now()}`;
      const route = validateRoutePayload({
        ...requestedRoute,
        id,
        numeroVoieUnique: requestedRoute.numeroVoieUnique || id,
      });
      route.videoUrls = normalizeVideoUrls(requestedRoute.videoUrls) || [];
      const result = await pool.query(
        `
          insert into routes (
            id, numero_voie_unique, numero_corde, couleur_prises, cotation_reference,
            cotation_ajustee, nom_voie, nom_ouvreur, moulinette_only, active, date_creation, tags, video_urls
          ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
          returning *
        `,
        [
          id,
          String(route.numeroVoieUnique || "").trim(),
          route.numeroCorde === undefined || route.numeroCorde === null || route.numeroCorde === ""
            ? null
            : Number(route.numeroCorde),
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
        ]
      );
      res.status(201).json(routeDbToApi(result.rows[0]));
    } catch (error) {
      console.error("POST /routes", error);
      res.status(error.status || 500).json({
        error: error.message || "Erreur création voie",
        fields: error.fields || undefined,
      });
    }
  });

  app.put("/routes/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      await ensureVideoSchema();
      const route = validateRoutePayload(req.body || {}, { partial: true });
      route.videoUrls = normalizeVideoUrls(req.body?.videoUrls);
      const result = await pool.query(
        `
          update routes
          set
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
          where id = $1
          returning *
        `,
        [
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
        ]
      );
      if (result.rowCount === 0) return res.status(404).json({ error: "Voie introuvable" });
      res.json(routeDbToApi(result.rows[0]));
    } catch (error) {
      console.error("PUT /routes/:id", error);
      res.status(error.status || 500).json({
        error: error.message || "Erreur mise à jour voie",
        fields: error.fields || undefined,
      });
    }
  });

  app.delete("/routes/:id", requireAuth, requireAdmin, async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const routeResult = await client.query(
        "select id from routes where id = $1 for update",
        [req.params.id],
      );
      if (!routeResult.rowCount) {
        await client.query("rollback");
        return res.status(404).json({ error: "Voie introuvable" });
      }

      const realisationsResult = await client.query(
        "delete from realisations where voie_id = $1",
        [req.params.id],
      );
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
