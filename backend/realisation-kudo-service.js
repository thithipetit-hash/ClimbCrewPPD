function normalizedParticipantId(value) {
  return String(value || "").trim();
}

async function readRealisationKudoState(db, realisationId, participantId = "") {
  const result = await db.query(
    `select participant_id::text as "participantId"
     from realisation_kudos
     where realisation_id = $1
     order by created_at asc, participant_id asc`,
    [realisationId],
  );
  const participantIds = result.rows.map((row) => String(row.participantId));
  const currentParticipantId = normalizedParticipantId(participantId);
  return {
    kudosCount: participantIds.length,
    kudosParticipantIds: participantIds,
    kudosByMe: currentParticipantId ? participantIds.includes(currentParticipantId) : false,
  };
}

export async function addRealisationKudo(db, { realisationId, participantId }) {
  const donorId = normalizedParticipantId(participantId);
  if (!donorId) {
    const error = new Error("Compte non relié à un grimpeur");
    error.status = 403;
    throw error;
  }

  const realisation = await db.query(
    "select participant_id from realisations where id = $1 limit 1",
    [realisationId],
  );
  if (!realisation.rowCount) {
    const error = new Error("Réalisation introuvable");
    error.status = 404;
    throw error;
  }
  if (String(realisation.rows[0].participant_id) === donorId) {
    const error = new Error("Vous ne pouvez pas donner un Kudo à votre propre réalisation.");
    error.status = 409;
    throw error;
  }

  await db.query(
    `insert into realisation_kudos (realisation_id, participant_id)
     values ($1, $2)
     on conflict (realisation_id, participant_id) do nothing`,
    [realisationId, donorId],
  );
  return readRealisationKudoState(db, realisationId, donorId);
}

export async function removeRealisationKudo(db, { realisationId, participantId }) {
  const donorId = normalizedParticipantId(participantId);
  if (!donorId) {
    const error = new Error("Compte non relié à un grimpeur");
    error.status = 403;
    throw error;
  }

  await db.query(
    "delete from realisation_kudos where realisation_id = $1 and participant_id = $2",
    [realisationId, donorId],
  );
  return readRealisationKudoState(db, realisationId, donorId);
}
