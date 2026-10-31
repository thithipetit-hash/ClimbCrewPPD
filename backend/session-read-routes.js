function parseIsoDateQuery(value, name) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const error = new Error(`${name} doit être au format AAAA-MM-JJ.`);
    error.status = 400;
    throw error;
  }
  const date = new Date(`${text}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    const error = new Error(`${name} contient une date invalide.`);
    error.status = 400;
    throw error;
  }
  return text;
}

export function parseSessionWindow(query = {}) {
  const from = parseIsoDateQuery(query.from, "from");
  const to = parseIsoDateQuery(query.to, "to");
  if (from && to && from > to) {
    const error = new Error("La date from doit être antérieure ou égale à to.");
    error.status = 400;
    throw error;
  }
  return { from, to };
}

export function sessionDbToApi(row, participantIds = []) {
  const registeredParticipantIds = [...new Set(participantIds.map(String))];

  return {
    id: row.id,
    date: row.date,
    slot: row.slot,
    status: row.status,
    encadrantId: row.encadrant_id ? String(row.encadrant_id) : null,
    referentId: row.referent_id ? String(row.referent_id) : null,
    participantIds: registeredParticipantIds,
  };
}

/**
 * Installe les opérations de lecture et de suppression des séances.
 *
 * PUT /sessions/:id reste volontairement dans le flux de remplacement sécurisé
 * d'admin-user-enhancements.js et n'est donc pas réimplémenté ici.
 */
export function installSessionReadRoutes(app, { requireAuth, requireAdmin, pool }) {
  app.get("/sessions", requireAuth, async (req, res) => {
    try {
      const window = parseSessionWindow(req.query || {});
      const sessionsResult = await pool.query(
        `
          select id, date, slot, status, encadrant_id, referent_id
          from sessions
          where ($1::date is null or date >= $1::date)
            and ($2::date is null or date <= $2::date)
          order by date asc, slot asc
        `,
        [window.from, window.to],
      );

      const inscriptionsResult = await pool.query(
        `
          select sp.session_id, sp.participant_id
          from session_participants sp
          join sessions s on s.id = sp.session_id
          where ($1::date is null or s.date >= $1::date)
            and ($2::date is null or s.date <= $2::date)
          order by sp.session_id asc, sp.created_at asc, sp.participant_id asc
        `,
        [window.from, window.to],
      );

      const participantIdsBySession = new Map();
      for (const inscription of inscriptionsResult.rows) {
        const list = participantIdsBySession.get(inscription.session_id) || [];
        list.push(String(inscription.participant_id));
        participantIdsBySession.set(inscription.session_id, list);
      }

      const sessions = sessionsResult.rows.map((session) =>
        sessionDbToApi(session, participantIdsBySession.get(session.id) || [])
      );
      res.json(sessions);
    } catch (error) {
      res.status(error.status || 500).json({
        error: error.message || String(error),
        fields: error.fields || undefined,
      });
    }
  });

  app.delete("/sessions/:id", requireAuth, requireAdmin, async (req, res) => {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      await client.query("begin");
      const sessionResult = await client.query(
        "select id, date, slot, status, encadrant_id, referent_id from sessions where id = $1 for update",
        [id],
      );
      if (!sessionResult.rowCount) {
        await client.query("rollback");
        return res.status(404).json({ error: "Séance introuvable" });
      }
      const participantsResult = await client.query(
        "select participant_id from session_participants where session_id = $1 order by created_at asc, participant_id asc",
        [id],
      );
      const history = await client.query(
        "select count(*)::integer as count from realisations where session_id = $1",
        [id],
      );
      const retainedRealisations = Number(history.rows[0]?.count || 0);
      if (retainedRealisations > 0) {
        await client.query("rollback");
        return res.status(409).json({
          error: `Cette séance contient ${retainedRealisations} réalisation(s) et ne peut pas être supprimée.`,
          retainedRealisations,
        });
      }

      await client.query("delete from sessions where id = $1", [id]);
      const session = sessionResult.rows[0];
      const participantIds = [...new Set(
        participantsResult.rows.map((row) => String(row.participant_id)),
      )];
      await client.query(
        `insert into access_logs (user_id, event_type, success, ip_address, user_agent, details)
         values ($1,'planning_session_deleted',true,$2,$3,$4::jsonb)`,
        [
          req.auth?.user?.id || null,
          req.ip || null,
          req.headers?.["user-agent"] || null,
          JSON.stringify({
            sessionId: String(id),
            before: {
              id: String(session.id),
              date: session.date,
              slot: session.slot,
              status: session.status,
              encadrantId: session.encadrant_id ? String(session.encadrant_id) : null,
              referentId: session.referent_id ? String(session.referent_id) : null,
              participantIds,
            },
          }),
        ],
      );
      await client.query("commit");
      return res.status(204).send();
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      return res.status(error.status || 500).json({
        error: error.message || "Suppression de la séance impossible",
        fields: error.fields || undefined,
      });
    } finally {
      client.release();
    }
  });
}
