export function installRealisationKudoRoutes(app, { requireAuth, pool }) {
  app.post("/realisations/:id/kudos", requireAuth, async (req, res) => {
    const participantId = String(req.auth?.user?.participantId || "");
    if (!participantId) return res.status(403).json({ error: "Compte non relié à un grimpeur" });
    try {
      const exists = await pool.query("select 1 from realisations where id = $1 limit 1", [req.params.id]);
      if (!exists.rowCount) return res.status(404).json({ error: "Réalisation introuvable" });
      await pool.query(
        `insert into realisation_kudos (realisation_id, participant_id) values ($1, $2)
         on conflict (realisation_id, participant_id) do nothing`,
        [req.params.id, participantId],
      );
      const count = await pool.query("select count(*)::integer as count from realisation_kudos where realisation_id = $1", [req.params.id]);
      return res.json({ ok: true, kudosCount: count.rows[0]?.count || 0, kudosByMe: true });
    } catch {
      return res.status(500).json({ error: "Kudo impossible." });
    }
  });

  app.delete("/realisations/:id/kudos", requireAuth, async (req, res) => {
    const participantId = String(req.auth?.user?.participantId || "");
    if (!participantId) return res.status(403).json({ error: "Compte non relié à un grimpeur" });
    try {
      await pool.query("delete from realisation_kudos where realisation_id = $1 and participant_id = $2", [req.params.id, participantId]);
      const count = await pool.query("select count(*)::integer as count from realisation_kudos where realisation_id = $1", [req.params.id]);
      return res.json({ ok: true, kudosCount: count.rows[0]?.count || 0, kudosByMe: false });
    } catch {
      return res.status(500).json({ error: "Retrait du Kudo impossible." });
    }
  });
}
