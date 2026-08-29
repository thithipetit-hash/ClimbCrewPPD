export class RealisationIntegrityError extends Error {
  constructor(message, field, status = 400) {
    super(message);
    this.name = "RealisationIntegrityError";
    this.status = status;
    this.fields = field ? { [field]: "invalid_relation" } : undefined;
  }
}

export async function assertRealisationIntegrity({ pool, realisation, participantId }) {
  const ownerId = String(participantId || "");
  if (!ownerId) throw new RealisationIntegrityError("Compte non relié à un grimpeur", "participantId", 403);

  const routeResult = await pool.query(
    "select id from routes where id = $1 limit 1",
    [realisation.voieId],
  );
  if (routeResult.rowCount === 0) {
    throw new RealisationIntegrityError("La voie sélectionnée n'existe pas.", "voieId");
  }

  const sessionResult = await pool.query(
    `
      select s.date, p.cotisation
      from sessions s
      join session_participants sp on sp.session_id = s.id
      join participants p on p.id::text = sp.participant_id
      where s.id = $1 and sp.participant_id = $2
      limit 1
    `,
    [realisation.sessionId, ownerId],
  );
  if (sessionResult.rowCount === 0) {
    throw new RealisationIntegrityError(
      "Le grimpeur doit être inscrit à la séance sélectionnée.",
      "sessionId",
    );
  }

  const session = sessionResult.rows[0];
  if (!session.cotisation) {
    throw new RealisationIntegrityError(
      "Le grimpeur doit être cotisant pour enregistrer une réalisation.",
      "participantId",
      403,
    );
  }
  if (String(realisation.dateRealisation).slice(0, 10) !== String(session.date).slice(0, 10)) {
    throw new RealisationIntegrityError(
      "La date de réalisation doit correspondre à la date de la séance.",
      "dateRealisation",
    );
  }

  if (!realisation.chute) return;
  const assureurId = String(realisation.assureurId || "");
  if (!assureurId) {
    throw new RealisationIntegrityError("Le binôme assureur est obligatoire lorsqu’un vol est enregistré.", "assureurId");
  }
  if (assureurId === ownerId) {
    throw new RealisationIntegrityError("Le grimpeur ne peut pas être son propre assureur.", "assureurId");
  }

  const belayerResult = await pool.query(
    `
      select 1
      from session_participants sp
      join participants p on p.id::text = sp.participant_id
      where sp.session_id = $1 and sp.participant_id = $2
      limit 1
    `,
    [realisation.sessionId, assureurId],
  );
  if (belayerResult.rowCount === 0) {
    throw new RealisationIntegrityError(
      "L’assureur doit être un participant inscrit à la même séance.",
      "assureurId",
    );
  }
}
