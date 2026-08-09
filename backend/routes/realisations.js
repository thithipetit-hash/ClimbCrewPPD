import express from "express";
import { validateRealisationPayload } from "../validation.js";
import { sendRouteError } from "./http.js";

export function createRealisationsRouter({ pool, requireAuth }) {
  const router = express.Router();
  router.use(requireAuth);

  router.get("/", async (_req, res) => {
    try {
      const result = await pool.query(`
        select id, participant_id as "participantId", session_id as "sessionId",
          voie_id as "voieId", date_realisation as "dateRealisation",
          style_realisation as "styleRealisation", commentaire,
          cotation_proposee as "cotationProposee", nb_essais as "nbEssais"
        from realisations
        order by date_realisation desc, created_at desc
      `);
      res.json(result.rows);
    } catch (error) { sendRouteError(res, error); }
  });

  router.post("/", async (req, res) => {
    try {
      const item = validateRealisationPayload(req.body || {});
      await pool.query(`
        insert into realisations (
          id, participant_id, session_id, voie_id, date_realisation,
          style_realisation, commentaire, cotation_proposee, nb_essais
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `, [item.id, item.participantId, item.sessionId, item.voieId,
        item.dateRealisation, item.styleRealisation, item.commentaire || "",
        item.cotationProposee || "", item.nbEssais || ""]);
      res.json(item);
    } catch (error) { sendRouteError(res, error); }
  });

  router.put("/:id", async (req, res) => {
    try {
      const patch = validateRealisationPayload(req.body || {}, { partial: true });
      await pool.query(`
        update realisations set participant_id = coalesce($2, participant_id),
          session_id = coalesce($3, session_id), voie_id = coalesce($4, voie_id),
          date_realisation = coalesce($5, date_realisation),
          style_realisation = coalesce($6, style_realisation),
          commentaire = coalesce($7, commentaire),
          cotation_proposee = coalesce($8, cotation_proposee),
          nb_essais = coalesce($9, nb_essais), updated_at = now()
        where id = $1
      `, [req.params.id, patch.participantId ?? null, patch.sessionId ?? null,
        patch.voieId ?? null, patch.dateRealisation ?? null,
        patch.styleRealisation ?? null, patch.commentaire ?? null,
        patch.cotationProposee ?? null, patch.nbEssais ?? null]);
      res.json({ ok: true });
    } catch (error) { sendRouteError(res, error); }
  });

  router.delete("/:id", async (req, res) => {
    try {
      await pool.query("delete from realisations where id = $1", [req.params.id]);
      res.json({ ok: true });
    } catch (error) { sendRouteError(res, error); }
  });

  return router;
}
