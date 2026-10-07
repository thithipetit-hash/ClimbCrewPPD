function isoDate(value) {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function normalizeChallenge(row) {
  return {
    id: String(row.id),
    name: row.name,
    description: row.description || "",
    startsOn: isoDate(row.starts_on ?? row.startsOn),
    endsOn: isoDate(row.ends_on ?? row.endsOn),
    status: row.status,
    targetMode: row.target_mode ?? row.targetMode ?? "snapshot",
    criteria: row.criteria || {},
    closedAt: row.closed_at ?? row.closedAt ?? null,
    targetRouteCount: Number(row.target_route_count ?? row.targetRouteCount ?? 0),
  };
}

function compareParticipantIds(a, b) {
  const aNumber = Number(a);
  const bNumber = Number(b);
  if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) return aNumber - bNumber;
  return String(a).localeCompare(String(b), "fr");
}

export function challengeBadgeDistinction(rank) {
  if (Number(rank) === 1) return "or";
  if (Number(rank) === 2) return "argent";
  if (Number(rank) === 3) return "bronze";
  return "participation";
}

export function normalizeChallengeRouteIds(value) {
  if (!Array.isArray(value)) {
    const error = new Error("Sélectionnez une ou plusieurs voies pour le challenge.");
    error.statusCode = 400;
    throw error;
  }

  const routeIds = [...new Set(value.map((routeId) => String(routeId || "").trim()).filter(Boolean))];
  if (routeIds.length === 0) {
    const error = new Error("Sélectionnez au moins une voie pour le challenge.");
    error.statusCode = 400;
    throw error;
  }
  return routeIds;
}

export async function findSelectedRoutes(db, routeIds) {
  const normalizedRouteIds = normalizeChallengeRouteIds(routeIds);
  const result = await db.query(
    `select id,
            numero_voie_unique as "numeroVoieUnique",
            numero_corde as "numeroCorde",
            couleur_prises as "couleurPrises",
            coalesce(cotation_ajustee, cotation_reference, '') as cotation,
            nom_voie as "nomVoie",
            nom_ouvreur as "nomOuvreur",
            active
       from routes
      where id::text = any($1::text[])
      order by numero_corde asc nulls last, numero_voie_unique asc`,
    [normalizedRouteIds],
  );

  const foundIds = new Set(result.rows.map((route) => String(route.id)));
  const missingIds = normalizedRouteIds.filter((routeId) => !foundIds.has(routeId));
  if (missingIds.length > 0) {
    const error = new Error("Une ou plusieurs voies sélectionnées n’existent plus.");
    error.statusCode = 400;
    throw error;
  }

  return result.rows;
}

export async function listChallenges(db) {
  const result = await db.query(
    `select c.*,
            count(cr.route_id)::integer as target_route_count
       from challenges c
       left join challenge_routes cr on cr.challenge_id = c.id
      group by c.id
      order by case when c.status = 'active' then 0 else 1 end,
               c.starts_on desc,
               c.created_at desc`,
  );
  return result.rows.map(normalizeChallenge);
}

async function loadChallengeRow(db, challengeId, { forUpdate = false } = {}) {
  const result = await db.query(
    `select c.*,
            (select count(*) from challenge_routes cr where cr.challenge_id = c.id)::integer as target_route_count
       from challenges c
      where c.id = $1
      ${forUpdate ? "for update" : ""}`,
    [challengeId],
  );
  return result.rows[0] ? normalizeChallenge(result.rows[0]) : null;
}

export async function loadChallengeRoutes(db, challengeId) {
  const result = await db.query(
    `select route_id as id, route_snapshot as snapshot
       from challenge_routes
      where challenge_id = $1
      order by coalesce(nullif(route_snapshot->>'numeroCorde', '')::integer, 9999),
               route_snapshot->>'numeroVoieUnique'`,
    [challengeId],
  );
  return result.rows.map((row) => ({ id: String(row.id), ...(row.snapshot || {}) }));
}

export async function calculateChallengeRanking(db, challenge, targetRoutes) {
  const routeIds = targetRoutes.map((route) => String(route.id));
  if (routeIds.length === 0) return [];

  const result = await db.query(
    `select r.id,
            r.participant_id as "participantId",
            r.voie_id as "voieId",
            r.date_realisation as "dateRealisation",
            r.style_realisation as "styleRealisation",
            r.mode_realisation as "modeRealisation",
            p.nom,
            p.prenom
       from realisations r
       join participants p on p.id::text = r.participant_id::text
      where r.voie_id::text = any($1::text[])
        and r.date_realisation >= $2::date
        and ($3::date is null or r.date_realisation <= $3::date)
      order by r.date_realisation asc, r.created_at asc`,
    [routeIds, challenge.startsOn, challenge.endsOn],
  );

  const routeIdSet = new Set(routeIds);
  const byParticipant = new Map();

  result.rows.forEach((realisation) => {
    if (!routeIdSet.has(String(realisation.voieId))) return;

    const participantId = String(realisation.participantId);
    const current = byParticipant.get(participantId) || {
      participantId,
      participantName: `${realisation.prenom || ""} ${realisation.nom || ""}`.trim(),
      completed: new Map(),
    };
    const routeId = String(realisation.voieId);
    const date = isoDate(realisation.dateRealisation);
    const previous = current.completed.get(routeId);
    if (!previous || date < previous) current.completed.set(routeId, date);
    byParticipant.set(participantId, current);
  });

  const ranking = [...byParticipant.values()].map((entry) => {
    const completionDates = [...entry.completed.values()].filter(Boolean).sort();
    return {
      participantId: entry.participantId,
      participantName: entry.participantName,
      score: entry.completed.size,
      completedRouteIds: [...entry.completed.keys()],
      finalScoringAt: completionDates.at(-1) || null,
    };
  });

  ranking.sort((a, b) => (
    b.score - a.score
    || String(a.finalScoringAt || "9999-12-31").localeCompare(String(b.finalScoringAt || "9999-12-31"))
    || compareParticipantIds(a.participantId, b.participantId)
  ));

  return ranking.map((entry, index) => ({ ...entry, rank: index + 1 }));
}

async function loadFrozenRanking(db, challengeId) {
  const result = await db.query(
    `select cr.participant_id::text as "participantId",
            concat(p.prenom, ' ', p.nom) as "participantName",
            cr.rank,
            cr.score,
            cr.completed_route_ids as "completedRouteIds",
            cr.final_scoring_at as "finalScoringAt",
            pb.metadata->>'distinction' as "challengeBadgeDistinction",
            (pb.id is not null) as "challengeBadge"
       from challenge_results cr
       join participants p on p.id = cr.participant_id
       left join participant_badges pb
         on pb.participant_id = cr.participant_id
        and pb.badge_type = 'challenge'
        and pb.source_type = 'challenge'
        and pb.source_id = cr.challenge_id::text
      where cr.challenge_id = $1
      order by cr.rank asc`,
    [challengeId],
  );
  return result.rows.map((row) => ({
    ...row,
    rank: Number(row.rank),
    score: Number(row.score),
    finalScoringAt: isoDate(row.finalScoringAt),
    completedRouteIds: (row.completedRouteIds || []).map(String),
    challengeBadgeDistinction: row.challengeBadgeDistinction || (row.challengeBadge ? challengeBadgeDistinction(row.rank) : null),
  }));
}

export async function getChallengeDetail(db, challengeId, currentParticipantId = null) {
  const challenge = await loadChallengeRow(db, challengeId);
  if (!challenge) return null;

  const targetRoutes = await loadChallengeRoutes(db, challengeId);
  const ranking = challenge.status === "closed"
    ? await loadFrozenRanking(db, challengeId)
    : await calculateChallengeRanking(db, challenge, targetRoutes);

  const participantId = currentParticipantId ? String(currentParticipantId) : "";
  const myRanking = ranking.find((entry) => String(entry.participantId) === participantId) || null;
  const myProgress = participantId
    ? {
        participantId,
        score: myRanking?.score || 0,
        rank: myRanking?.rank || null,
        completedRouteIds: myRanking?.completedRouteIds || [],
        challengeBadge: Boolean(myRanking?.challengeBadge),
        challengeBadgeDistinction: myRanking?.challengeBadgeDistinction || null,
      }
    : null;

  return {
    ...challenge,
    targetRoutes,
    ranking,
    myProgress,
  };
}

export async function createChallenge(db, { name, description, startsOn, endsOn, routeIds, createdBy }) {
  const normalizedRouteIds = normalizeChallengeRouteIds(routeIds);
  const routes = await findSelectedRoutes(db, normalizedRouteIds);

  const result = await db.query(
    `insert into challenges (name, description, starts_on, ends_on, criteria, target_mode, created_by)
     values ($1, $2, $3::date, $4::date, $5::jsonb, 'snapshot', $6::bigint)
     returning id`,
    [name, description, startsOn, endsOn || null, JSON.stringify({ routeIds: normalizedRouteIds }), createdBy],
  );
  const challengeId = result.rows[0].id;

  for (const route of routes) {
    const snapshot = {
      numeroVoieUnique: route.numeroVoieUnique,
      numeroCorde: route.numeroCorde,
      couleurPrises: route.couleurPrises,
      cotation: route.cotation,
      nomVoie: route.nomVoie,
      nomOuvreur: route.nomOuvreur,
    };
    await db.query(
      `insert into challenge_routes (challenge_id, route_id, route_snapshot)
       values ($1::bigint, $2::text, $3::jsonb)`,
      [challengeId, String(route.id), JSON.stringify(snapshot)],
    );
  }

  return String(challengeId);
}

export async function closeChallenge(db, challengeId) {
  const challenge = await loadChallengeRow(db, challengeId, { forUpdate: true });
  if (!challenge) {
    const error = new Error("Challenge introuvable.");
    error.statusCode = 404;
    throw error;
  }

  if (challenge.status === "closed") return challenge;

  const targetRoutes = await loadChallengeRoutes(db, challengeId);
  const ranking = await calculateChallengeRanking(db, challenge, targetRoutes);

  for (const entry of ranking) {
    await db.query(
      `insert into challenge_results
         (challenge_id, participant_id, rank, score, completed_route_ids, final_scoring_at)
       values ($1, $2::bigint, $3, $4, $5::text[], $6::date)
       on conflict (challenge_id, participant_id) do nothing`,
      [challengeId, entry.participantId, entry.rank, entry.score, entry.completedRouteIds, entry.finalScoringAt],
    );
  }

  for (const participant of ranking) {
    const distinction = challengeBadgeDistinction(participant.rank);
    await db.query(
      `insert into participant_badges
         (participant_id, badge_type, label, source_type, source_id, metadata)
       values ($1::bigint, 'challenge', $2::text, 'challenge', $3::text, $4::jsonb)
       on conflict (participant_id, badge_type, source_type, source_id)
       do update set label = excluded.label,
                     metadata = excluded.metadata`,
      [participant.participantId, challenge.name, String(challengeId), JSON.stringify({
        challengeName: challenge.name,
        rank: participant.rank,
        score: participant.score,
        distinction,
      })],
    );
  }

  await db.query(
    `update challenges
        set status = 'closed', closed_at = now(), updated_at = now()
      where id = $1`,
    [challengeId],
  );

  return { ...challenge, status: "closed" };
}

export async function listParticipantChallengeBadges(db, participantId) {
  const result = await db.query(
    `select pb.id::text,
            pb.label,
            pb.badge_type as "badgeType",
            pb.source_id as "sourceId",
            pb.metadata,
            pb.awarded_at as "awardedAt"
       from participant_badges pb
      where pb.participant_id = $1::bigint
        and pb.badge_type = 'challenge'
      order by pb.awarded_at desc`,
    [participantId],
  );
  return result.rows;
}