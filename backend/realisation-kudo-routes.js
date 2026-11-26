import { addRealisationKudo, removeRealisationKudo } from "./realisation-kudo-service.js";

export function installRealisationKudoRoutes(app, { requireAuth, pool }) {
  app.get("/realisations/kudos/stats", requireAuth, async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `select p.id as "participantId",
                coalesce(given.count, 0)::integer as "givenCount",
                coalesce(received.count, 0)::integer as "receivedCount"
         from participants p
         left join (
           select participant_id, count(*)::integer as count
           from realisation_kudos
           group by participant_id
         ) given on given.participant_id = p.id
         left join (
           select r.participant_id, count(*)::integer as count
           from realisation_kudos k
           join realisations r on r.id = k.realisation_id
           group by r.participant_id
         ) received on received.participant_id = p.id
         order by p.id`,
      );
      return res.json(rows);
    } catch (error) {
      console.error("GET /realisations/kudos/stats", error);
      return res.status(500).json({ error: "Classement des Kudos indisponible." });
    }
  });

  app.post("/realisations/:id/kudos", requireAuth, async (req, res) => {
    try {
      const state = await addRealisationKudo(pool, {
        realisationId: req.params.id,
        participantId: req.auth?.user?.participantId,
      });
      return res.json({ ok: true, ...state });
    } catch (error) {
      return res.status(error.status || 500).json({
        error: error.status ? error.message : "Kudo impossible.",
      });
    }
  });

  app.delete("/realisations/:id/kudos", requireAuth, async (req, res) => {
    try {
      const state = await removeRealisationKudo(pool, {
        realisationId: req.params.id,
        participantId: req.auth?.user?.participantId,
      });
      return res.json({ ok: true, ...state });
    } catch (error) {
      return res.status(error.status || 500).json({
        error: error.status ? error.message : "Retrait du Kudo impossible.",
      });
    }
  });
}
