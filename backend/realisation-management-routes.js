import { validateRealisationPayload } from "./validation.js";
import { assertRealisationIntegrity } from "./realisation-integrity.js";

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
  app.post("/realisations", requireAuth, async (req, res) => {
    try {
      const participantId = req.auth?.user?.participantId;
      if (!participantId) return res.status(403).json({ error: "Compte non relié à un grimpeur" });
      const realisation = validateRealisationPayload({
        ...(req.body || {}),
        participantId: String(participantId),
      });
      realisation.participantId = String(participantId);
      await assertRealisationIntegrity({ pool, realisation, participantId });

      await pool.query(
        `
          insert into realisations (
            id, participant_id, session_id, voie_id, date_realisation, style_realisation,
            commentaire, cotation_proposee, nb_essais, rating, chute, assureur_id
          ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        `,
        [
          realisation.id, realisation.participantId, realisation.sessionId, realisation.voieId,
          realisation.dateRealisation, realisation.styleRealisation, realisation.commentaire || "",
          realisation.cotationProposee || "", realisation.nbEssais || "", realisation.rating ?? null,
          Boolean(realisation.chute), realisation.assureurId || null,
        ],
      );
      res.json(realisation);
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message || String(error), fields: error.fields || undefined });
    }
  });

  app.put("/realisations/:id", requireAuth, async (req, res) => {
    try {
      const participantId = req.auth?.user?.participantId;
      if (!participantId) return res.status(403).json({ error: "Compte non relié à un grimpeur" });
      const patch = validateRealisationPayload(req.body || {}, { partial: true });
      delete patch.participantId;

      const currentResult = await pool.query(
        `
          select session_id, voie_id, date_realisation, chute, assureur_id
          from realisations
          where id = $1 and participant_id = $2
          limit 1
        `,
        [req.params.id, participantId],
      );
      if (currentResult.rowCount === 0) {
        return res.status(403).json({ error: "Cette réalisation ne vous appartient pas" });
      }

      const candidate = rowToIntegrityCandidate(currentResult.rows[0], patch, participantId);
      await assertRealisationIntegrity({ pool, realisation: candidate, participantId });

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
            updated_at = now()
          where id = $1 and participant_id = $12
        `,
        [
          req.params.id, patch.sessionId ?? null, patch.voieId ?? null, patch.dateRealisation ?? null,
          patch.styleRealisation ?? null, patch.commentaire ?? null, patch.cotationProposee ?? null,
          patch.nbEssais ?? null, patch.rating ?? null, patch.chute ?? null, patch.assureurId ?? null,
          participantId,
        ],
      );
      if (result.rowCount === 0) return res.status(403).json({ error: "Cette réalisation ne vous appartient pas" });
      res.json({ ok: true });
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
