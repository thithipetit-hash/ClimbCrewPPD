import {
  closeChallenge,
  createChallenge,
  getChallengeDetail,
  listChallenges,
  listParticipantChallengeBadges,
} from "./challenge-service.js";

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function cleanIsoDate(value, { required = false } = {}) {
  const date = String(value || "").trim();
  if (!date) {
    if (required) {
      const error = new Error("La date de début est obligatoire.");
      error.statusCode = 400;
      throw error;
    }
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T12:00:00Z`).getTime())) {
    const error = new Error("Date invalide.");
    error.statusCode = 400;
    throw error;
  }
  return date;
}

function sendChallengeError(res, error, fallback) {
  const status = Number(error?.statusCode) || 500;
  res.status(status).json({ error: status >= 500 ? fallback : (error?.message || fallback) });
}

async function rollbackQuietly(client) {
  if (!client) return;
  try {
    await client.query("rollback");
  } catch {
    // La réponse d'origine doit rester prioritaire même si PostgreSQL est déjà sorti de transaction.
  }
}

async function currentParticipantId(db, authUser) {
  if (authUser?.participantId) return String(authUser.participantId);
  const result = await db.query(`select participant_id from users where id = $1::bigint`, [authUser?.id]);
  return result.rows[0]?.participant_id ? String(result.rows[0].participant_id) : null;
}

export function installChallengeRoutes(app, { requireAuth, requireAdmin, pool }) {
  app.get("/challenges", requireAuth, async (_req, res) => {
    try {
      res.json(await listChallenges(pool));
    } catch (error) {
      sendChallengeError(res, error, "Chargement des challenges impossible.");
    }
  });

  app.get("/challenges/:id", requireAuth, async (req, res) => {
    try {
      const challengeId = Number(req.params.id);
      if (!Number.isInteger(challengeId) || challengeId <= 0) return res.status(400).json({ error: "Challenge invalide." });
      const participantId = await currentParticipantId(pool, req.auth.user);
      const challenge = await getChallengeDetail(pool, challengeId, participantId);
      if (!challenge) return res.status(404).json({ error: "Challenge introuvable." });
      res.json(challenge);
    } catch (error) {
      sendChallengeError(res, error, "Chargement du challenge impossible.");
    }
  });

  app.get("/challenge-badges/me", requireAuth, async (req, res) => {
    try {
      const participantId = await currentParticipantId(pool, req.auth.user);
      if (!participantId) return res.json([]);
      res.json(await listParticipantChallengeBadges(pool, participantId));
    } catch (error) {
      sendChallengeError(res, error, "Chargement des badges challenge impossible.");
    }
  });

  app.get("/challenge-badges/:participantId", requireAuth, async (req, res) => {
    try {
      const participantId = Number(req.params.participantId);
      if (!Number.isInteger(participantId) || participantId <= 0) return res.status(400).json({ error: "Participant invalide." });
      res.json(await listParticipantChallengeBadges(pool, participantId));
    } catch (error) {
      sendChallengeError(res, error, "Chargement des badges challenge impossible.");
    }
  });

  app.post("/admin/challenges", requireAuth, requireAdmin, async (req, res) => {
    let client = null;
    try {
      const name = cleanText(req.body?.name, 120);
      const description = cleanText(req.body?.description, 2000);
      const startsOn = cleanIsoDate(req.body?.startsOn, { required: true });
      const endsOn = cleanIsoDate(req.body?.endsOn);
      if (name.length < 3) return res.status(400).json({ error: "Le nom doit contenir au moins 3 caractères." });
      if (endsOn && endsOn < startsOn) return res.status(400).json({ error: "La date de fin doit être postérieure à la date de début." });

      client = await pool.connect();
      await client.query("begin");
      const challengeId = await createChallenge(client, {
        name,
        description,
        startsOn,
        endsOn,
        routeIds: req.body?.routeIds,
        createdBy: req.auth.user.id,
      });
      const participantId = await currentParticipantId(client, req.auth.user);
      const createdChallenge = await getChallengeDetail(client, Number(challengeId), participantId);
      await client.query("commit");
      return res.status(201).json(createdChallenge);
    } catch (error) {
      await rollbackQuietly(client);
      return sendChallengeError(res, error, "Création du challenge impossible.");
    } finally {
      client?.release();
    }
  });

  app.post("/admin/challenges/:id/close", requireAuth, requireAdmin, async (req, res) => {
    const challengeId = Number(req.params.id);
    if (!Number.isInteger(challengeId) || challengeId <= 0) return res.status(400).json({ error: "Challenge invalide." });

    let client = null;
    try {
      client = await pool.connect();
      await client.query("begin");
      await closeChallenge(client, challengeId);
      const participantId = await currentParticipantId(client, req.auth.user);
      const closedChallenge = await getChallengeDetail(client, challengeId, participantId);
      await client.query("commit");
      return res.json(closedChallenge);
    } catch (error) {
      await rollbackQuietly(client);
      return sendChallengeError(res, error, "Clôture du challenge impossible.");
    } finally {
      client?.release();
    }
  });
}
