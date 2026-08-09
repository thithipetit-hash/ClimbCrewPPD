import express from "express";
import { ValidationError, validateParticipantPayload } from "../validation.js";
import { sendRouteError } from "./http.js";

function toApi(row) {
  return {
    id: String(row.id), nom: row.nom, prenom: row.prenom, email: row.email || "",
    passport: row.passport, cotisation: row.cotisation, ffme: row.ffme,
    canEncadrer: row.can_encadrer, canReferer: row.can_referer, canAdmin: row.can_admin,
  };
}

export function createParticipantsRouter({ pool, requireAuth, requireAdmin }) {
  const router = express.Router();
  router.use(requireAuth);

  router.get("/", async (_req, res) => {
    try {
      const result = await pool.query(`
        select id, nom, prenom, email, passport, cotisation, ffme,
          can_encadrer, can_referer, can_admin
        from participants order by prenom asc, nom asc
      `);
      res.json(result.rows.map(toApi));
    } catch (error) { sendRouteError(res, error); }
  });

  router.post("/", requireAdmin, async (req, res) => {
    try {
      const p = validateParticipantPayload(req.body || {});
      const result = await pool.query(`
        insert into participants
          (nom, prenom, email, passport, cotisation, ffme, can_encadrer, can_referer, can_admin)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        returning id, nom, prenom, email, passport, cotisation, ffme,
          can_encadrer, can_referer, can_admin
      `, [p.nom, p.prenom, p.email, p.passport, p.cotisation, p.ffme,
        p.canEncadrer, p.canReferer, p.canAdmin]);
      res.status(201).json(toApi(result.rows[0]));
    } catch (error) { sendRouteError(res, error); }
  });

  router.put("/:id", requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        throw new ValidationError("L'identifiant du participant est invalide.", { id: "invalid_identifier" });
      }
      const p = validateParticipantPayload(req.body || {});
      const result = await pool.query(`
        update participants set nom=$2, prenom=$3, email=$4, passport=$5,
          cotisation=$6, ffme=$7, can_encadrer=$8, can_referer=$9, can_admin=$10
        where id=$1
        returning id, nom, prenom, email, passport, cotisation, ffme,
          can_encadrer, can_referer, can_admin
      `, [id, p.nom, p.prenom, p.email, p.passport, p.cotisation, p.ffme,
        p.canEncadrer, p.canReferer, p.canAdmin]);
      if (!result.rowCount) return res.status(404).json({ error: "participant not found" });
      res.json(toApi(result.rows[0]));
    } catch (error) { sendRouteError(res, error); }
  });

  router.delete("/:id", requireAdmin, async (req, res) => {
    try {
      const result = await pool.query("delete from participants where id = $1", [Number(req.params.id)]);
      if (!result.rowCount) return res.status(404).json({ error: "participant not found" });
      res.status(204).send();
    } catch (error) { sendRouteError(res, error); }
  });
  return router;
}
