export class RealisationIntegrityError extends Error {
  constructor(message, field, status = 400) {
    super(message);
    this.name = "RealisationIntegrityError";
    this.status = status;
    this.fields = field ? { [field]: "invalid_relation" } : undefined;
  }
}

async function assertRecentEligibleSessionDay(pool, participantId, sessionId) {
  const result = await pool.query(
    `
      select distinct s.date
      from sessions s
      where s.date <= current_date
        and (
          exists (
            select 1 from session_participants sp
            where sp.session_id = s.id and sp.participant_id::text = $1
          )
          or s.encadrant_id::text = $1
          or s.referent_id::text = $1
        )
      order by s.date desc
      limit 5
    `,
    [String(participantId)],
  );
  const allowedDays = new Set(result.rows.map((row) => String(row.date).slice(0, 10)));
  const sessionDate = await pool.query("select date from sessions where id = $1 limit 1", [sessionId]);
  const selectedDay = String(sessionDate.rows[0]?.date || "").slice(0, 10);
  if (!selectedDay || !allowedDays.has(selectedDay)) {
    throw new RealisationIntegrityError(
      "La réalisation doit être rattachée à l’une des cinq dernières dates de séance passées.",
      "sessionId",
    );
  }
}

export async function assertRealisationIntegrity({ pool, realisation, participantId, enforceRecentSession = false }) {
  const ownerId = String(participantId || "");
  if (!ownerId) throw new RealisationIntegrityError("Compte non relié à un grimpeur", "participantId", 403);

  const routeResult = await pool.query(
    "select id from routes where id = $1 limit 1",
    [realisation.voieId],
  );
  if (routeResult.rowCount === 0) {
    throw new RealisationIntegrityError("La voie sélectionnée n'existe pas.", "voieId");
  }

  // participant_id est historique : certaines bases l'ont encore en text,
  // les bases migrées l'ont en bigint. Comparer sa représentation textuelle
  // maintient la validation compatible pendant toute la phase de migration.
  const sessionResult = await pool.query(
    `
      select s.date, p.cotisation
      from sessions s
      join participants p on p.id::text = $2
      where s.id = $1
        and (
          exists (
            select 1 from session_participants sp
            where sp.session_id = s.id and sp.participant_id::text = $2
          )
          or s.encadrant_id::text = $2
          or s.referent_id::text = $2
        )
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
  if (enforceRecentSession) await assertRecentEligibleSessionDay(pool, ownerId, realisation.sessionId);
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
      from sessions s
      join participants p on p.id::text = $2
      where s.id = $1
        and (
          exists (
            select 1 from session_participants sp
            where sp.session_id = s.id and sp.participant_id::text = $2
          )
          or s.encadrant_id::text = $2
          or s.referent_id::text = $2
        )
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
