import { getPool } from "./database.js";

function toBoolean(value) {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1") return true;
  return String(value || "").trim().toLowerCase() === "true";
}

export async function updateParticipantInitiatorQualifications(req, res) {
  try {
    const participantId = String(req.params.id || "").trim();
    if (!/^\d+$/.test(participantId)) {
      return res.status(400).json({ error: "Participant invalide" });
    }

    const initiateurSae = toBoolean(req.body?.initiateurSae);
    const initiateurSne = toBoolean(req.body?.initiateurSne);

    const result = await getPool().query(
      `
        update participants
        set initiateur_sae = $2,
            initiateur_sne = $3
        where id = $1
        returning id, initiateur_sae, initiateur_sne
      `,
      [participantId, initiateurSae, initiateurSne],
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Participant introuvable" });
    }

    const participant = result.rows[0];
    return res.json({
      id: String(participant.id),
      initiateurSae: Boolean(participant.initiateur_sae),
      initiateurSne: Boolean(participant.initiateur_sne),
    });
  } catch (error) {
    console.error("PUT /admin/participants/:id/qualifications", error);
    return res.status(500).json({ error: "Enregistrement des qualifications impossible" });
  }
}
