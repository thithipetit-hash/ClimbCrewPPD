import express from "express";
import { validateSessionPayload } from "../validation.js";
import { sendRouteError } from "./http.js";

function toApi(row, participantIds = []) {
  return {
    id: row.id, date: row.date, slot: row.slot, status: row.status,
    encadrantId: row.encadrant_id ? String(row.encadrant_id) : null,
    referentId: row.referent_id ? String(row.referent_id) : null,
    participantIds: participantIds.map(String),
  };
}

export function createSessionsRouter({ pool, requireAuth, requireAdmin, defaultSessionStatus }) {
  const router = express.Router();
  router.use(requireAuth);

  router.get("/", async (_req, res) => {
    try {
      const [sessions, inscriptions] = await Promise.all([
        pool.query("select id, date, slot, status, encadrant_id, referent_id from sessions order by date asc, slot asc"),
        pool.query("select session_id, participant_id from session_participants order by session_id asc"),
      ]);
      const ids = new Map();
      for (const row of inscriptions.rows) {
        const list = ids.get(row.session_id) || [];
        list.push(String(row.participant_id));
        ids.set(row.session_id, list);
      }
      res.json(sessions.rows.map((session) => toApi(session, ids.get(session.id) || [])));
    } catch (error) { sendRouteError(res, error); }
  });

  router.put("/:id", async (req, res) => {
    const client = await pool.connect();
    try {
      const session = validateSessionPayload(req.body || {}, req.params.id);
      const status = session.status || defaultSessionStatus(session.date, session.slot);
      await client.query("begin");
      const result = await client.query(`
        insert into sessions (id, date, slot, status, encadrant_id, referent_id)
        values ($1,$2,$3,$4,$5,$6)
        on conflict (id) do update set date=excluded.date, slot=excluded.slot,
          status=excluded.status, encadrant_id=excluded.encadrant_id,
          referent_id=excluded.referent_id, updated_at=now()
        returning id, date, slot, status, encadrant_id, referent_id
      `, [session.id, session.date, session.slot, status,
        session.encadrantId || null, session.referentId || null]);
      const previous = await client.query(
        "select participant_id from session_participants where session_id = $1", [session.id],
      );
      const previousIds = new Set(previous.rows.map((row) => String(row.participant_id)));
      await client.query("delete from session_participants where session_id = $1", [session.id]);
      const participantIds = [...new Set(session.participantIds.map(String))];
      const added = participantIds.filter((id) => !previousIds.has(id));
      if (status === "libre" && added.length) {
        const eligible = await client.query(
          "select id from participants where id = any($1::bigint[]) and lower(passport) in ('jaune','orange','vert','bleu')",
          [added],
        );
        const eligibleIds = new Set(eligible.rows.map((row) => String(row.id)));
        if (added.some((id) => !eligibleIds.has(id))) {
          await client.query("rollback");
          return res.status(400).json({
            error: "Une séance libre est réservée aux passeports Jaune, Orange, Vert ou Bleu pour toute nouvelle inscription.",
          });
        }
      }
      for (const participantId of participantIds) {
        await client.query(`
          insert into session_participants (session_id, participant_id)
          values ($1,$2) on conflict do nothing
        `, [session.id, participantId]);
      }
      await client.query("commit");
      res.json(toApi(result.rows[0], participantIds));
    } catch (error) {
      await client.query("rollback");
      sendRouteError(res, error);
    } finally { client.release(); }
  });

  router.delete("/:id", requireAdmin, async (req, res) => {
    try {
      await pool.query("delete from sessions where id = $1", [req.params.id]);
      res.status(204).send();
    } catch (error) { sendRouteError(res, error); }
  });
  return router;
}
