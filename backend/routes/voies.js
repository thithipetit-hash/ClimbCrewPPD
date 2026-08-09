import express from "express";
import { validateRoutePayload } from "../validation.js";
import { sendRouteError } from "./http.js";

function ropeDbToApi(row) {
  return { numeroCorde: Number(row.numero_corde), actif: Boolean(row.actif), couleurCorde: row.couleur_corde || "" };
}

function routeDbToApi(row) {
  return {
    id: row.id, numeroVoieUnique: row.numero_voie_unique,
    numeroCorde: row.numero_corde === null ? null : Number(row.numero_corde),
    couleurPrises: row.couleur_prises || "", cotationReference: row.cotation_reference || "",
    cotationAjustee: row.cotation_ajustee || row.cotation_reference || "",
    nomVoie: row.nom_voie || "", nomOuvreur: row.nom_ouvreur || "",
    moulinetteOnly: Boolean(row.moulinette_only), active: Boolean(row.active),
    dateCreation: row.date_creation || "",
  };
}

export function createVoiesRouter({ pool, requireAuth, requireAdmin }) {
  const router = express.Router();
  router.use(requireAuth);

  router.get("/ropes", async (_req, res) => {
    try {
      const result = await pool.query("select numero_corde, actif, couleur_corde from ropes order by numero_corde asc");
      res.json(result.rows.map(ropeDbToApi));
    } catch (error) { sendRouteError(res, error, "Erreur chargement cordes"); }
  });

  router.get("/routes", async (_req, res) => {
    try {
      const result = await pool.query("select * from routes order by numero_corde asc nulls last, numero_voie_unique asc");
      res.json(result.rows.map(routeDbToApi));
    } catch (error) { sendRouteError(res, error, "Erreur chargement voies"); }
  });

  router.post("/routes", requireAdmin, async (req, res) => {
    try {
      const requested = req.body || {};
      const id = requested.id || `route-${Date.now()}`;
      const route = validateRoutePayload({ ...requested, id, numeroVoieUnique: requested.numeroVoieUnique || id });
      const result = await pool.query(`
        insert into routes (id, numero_voie_unique, numero_corde, couleur_prises,
          cotation_reference, cotation_ajustee, nom_voie, nom_ouvreur,
          moulinette_only, active, date_creation)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *
      `, [id, route.numeroVoieUnique, route.numeroCorde, route.couleurPrises,
        route.cotationReference, route.cotationAjustee || route.cotationReference,
        route.nomVoie || "", route.nomOuvreur, route.moulinetteOnly,
        route.active !== false, route.dateCreation]);
      res.status(201).json(routeDbToApi(result.rows[0]));
    } catch (error) { sendRouteError(res, error, "Erreur création voie"); }
  });

  router.put("/routes/:id", requireAdmin, async (req, res) => {
    try {
      const route = validateRoutePayload(req.body || {}, { partial: true });
      const result = await pool.query(`
        update routes set numero_voie_unique = coalesce($2, numero_voie_unique),
          numero_corde = coalesce($3, numero_corde), couleur_prises = coalesce($4, couleur_prises),
          cotation_reference = coalesce($5, cotation_reference),
          cotation_ajustee = coalesce($6, cotation_ajustee), nom_voie = coalesce($7, nom_voie),
          nom_ouvreur = coalesce($8, nom_ouvreur), moulinette_only = coalesce($9, moulinette_only),
          active = coalesce($10, active), date_creation = coalesce($11, date_creation),
          updated_at = now() where id = $1 returning *
      `, [req.params.id, route.numeroVoieUnique ?? null, route.numeroCorde ?? null,
        route.couleurPrises ?? null, route.cotationReference ?? null,
        route.cotationAjustee ?? null, route.nomVoie ?? null, route.nomOuvreur ?? null,
        route.moulinetteOnly ?? null, route.active ?? null, route.dateCreation ?? null]);
      if (!result.rowCount) return res.status(404).json({ error: "Voie introuvable" });
      res.json(routeDbToApi(result.rows[0]));
    } catch (error) { sendRouteError(res, error, "Erreur mise à jour voie"); }
  });

  return router;
}
