import { getPool } from "./database.js";

/** Le grimpeur cible est exclusivement celui du compte authentifié. */
async function changeOwnCprResetDate(req, res, recalculate) {
  const participantId = String(req.auth?.user?.participantId || "");
  if (!/^[1-9]\d*$/.test(participantId)) {
    return res.status(409).json({ error: "Le compte n'est pas relié à une fiche grimpeur" });
  }

  const action = recalculate ? "recalculate" : "reset";
  try {
    const result = await getPool().query(
      recalculate
        ? "update participants set cpr_reset_at = null where id = $1 returning cpr_reset_at"
        : "update participants set cpr_reset_at = now() where id = $1 returning cpr_reset_at",
      [participantId],
    );
    if (!result.rowCount) return res.status(404).json({ error: "Grimpeur introuvable" });
    return res.json({ ok: true, cprResetAt: result.rows[0].cpr_reset_at });
  } catch (error) {
    console.error(`POST /participants/me/${recalculate ? "statistics" : "cpr"}/${action}`, error);
    return res.status(500).json({
      error: recalculate ? "Recalcul des statistiques impossible" : "Réinitialisation du CPR impossible",
    });
  }
}

export function resetOwnCpr(req, res) {
  return changeOwnCprResetDate(req, res, false);
}

/** Réintègre l'historique au CPR ; les statistiques sont ensuite recalculées côté client. */
export function recalculateOwnStatisticsAndCpr(req, res) {
  return changeOwnCprResetDate(req, res, true);
}
