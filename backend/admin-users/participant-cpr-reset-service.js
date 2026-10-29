import { getPool } from "./database.js";

/** Seul le détenteur de la session peut remettre son propre CPR à zéro. */
export async function resetOwnCpr(req, res) {
  const participantId = String(req.auth?.user?.participantId || "");
  if (!/^[1-9]\d*$/.test(participantId)) {
    return res.status(409).json({ error: "Le compte n'est pas relié à une fiche grimpeur" });
  }

  try {
    const result = await getPool().query(
      "update participants set cpr_reset_at = now() where id = $1 returning cpr_reset_at",
      [participantId],
    );
    if (!result.rowCount) return res.status(404).json({ error: "Grimpeur introuvable" });
    return res.json({ ok: true, cprResetAt: result.rows[0].cpr_reset_at });
  } catch (error) {
    console.error("POST /participants/me/cpr/reset", error);
    return res.status(500).json({ error: "Réinitialisation du CPR impossible" });
  }
}
