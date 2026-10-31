import { getPool } from "./database.js";

/**
 * Les secrets d'authentification sont volontairement exclus. L'export reste
 * suffisamment complet pour audit/maintenance, mais les collections métier sont
 * sérialisées dans le même format camelCase que l'import administrateur.
 */
const EXPORT_QUERIES = {
  participants: `select * from participants order by id`,
  users: `
    select id, participant_id, email, prenom, nom, role, is_admin, status,
           must_reset_password, created_at, approved_at, revoked_at,
           revoked_reason, last_login_at, theme_preference
    from users
    order by id
  `,
  sessions: `select * from sessions order by date, slot, id`,
  sessionParticipants: `select * from session_participants order by session_id, participant_id`,
  ropes: `select * from ropes order by numero_corde`,
  routes: `select * from routes order by numero_corde nulls last, numero_voie_unique`,
  realisations: `select * from realisations order by date_realisation, id`,
  accessLogs: `
    select id, user_id, event_type, success, ip_address, user_agent, details, created_at
    from access_logs
    order by created_at desc
  `,
};

function serializeParticipant(row) {
  return {
    id: String(row.id),
    nom: row.nom,
    prenom: row.prenom,
    email: row.login_email || row.email || "",
    passport: row.passport || "sans",
    passportDecouverte: Boolean(row.passport_decouverte),
    passeportFfme: Boolean(row.passeport_ffme),
    sexe: row.sexe || "",
    anneeNaissance: row.annee_naissance ?? null,
    cotisation: Boolean(row.cotisation),
    ffme: Boolean(row.ffme),
    initiateurSae: Boolean(row.initiateur_sae),
    initiateurSne: Boolean(row.initiateur_sne),
    canEncadrer: Boolean(row.can_encadrer),
    canReferer: Boolean(row.can_referer),
    canAdmin: Boolean(row.can_admin),
    avatarId: row.avatar_id || "gecko",
    crestId: row.crest_id || "cristal",
    profilePublic: row.profile_public !== false,
    customAvatarImage: row.custom_avatar_image || "",
  };
}

function serializeRope(row) {
  return {
    numeroCorde: Number(row.numero_corde),
    actif: row.actif !== false,
    couleurCorde: row.couleur_corde || "",
  };
}

function serializeRoute(row) {
  return {
    id: row.id,
    numeroVoieUnique: row.numero_voie_unique || row.id,
    numeroCorde: row.numero_corde === null || row.numero_corde === undefined ? 0 : Number(row.numero_corde),
    couleurPrises: row.couleur_prises || "",
    cotationReference: row.cotation_reference || "",
    cotationAjustee: row.cotation_ajustee || row.cotation_reference || "",
    nomVoie: row.nom_voie || "",
    nomOuvreur: row.nom_ouvreur || "",
    moulinetteOnly: Boolean(row.moulinette_only),
    active: row.active !== false,
    dateCreation: row.date_creation || "",
    tags: Array.isArray(row.tags) ? row.tags : [],
  };
}

function serializeRealisation(row) {
  const legacyMode = ["en_tete", "moulinette"].includes(String(row.nb_essais || ""))
    ? String(row.nb_essais)
    : undefined;
  const storedMode = ["en_tete", "moulinette"].includes(String(row.mode_realisation || ""))
    ? String(row.mode_realisation)
    : legacyMode;
  return {
    id: row.id,
    participantId: String(row.participant_id),
    sessionId: row.session_id,
    voieId: row.voie_id,
    dateRealisation: row.date_realisation,
    styleRealisation: row.style_realisation,
    commentaire: row.commentaire || "",
    cotationProposee: row.cotation_proposee || "",
    nbEssais: legacyMode ? "" : (row.nb_essais || ""),
    modeRealisation: storedMode || "en_tete",
    // Une ancienne réalisation peut ne pas avoir de note. Une chaîne vide est
    // volontairement utilisée : validateLegacyImportPayload la traite comme
    // « non renseignée », alors que 0 serait rejeté hors de la plage 1..5.
    rating: row.rating === null || row.rating === undefined ? "" : Number(row.rating),
    chute: Boolean(row.chute),
    assureurId: row.assureur_id ? String(row.assureur_id) : "",
  };
}

function serializeSession(row, participantIds) {
  return {
    id: row.id,
    date: row.date,
    slot: row.slot,
    status: row.status,
    encadrantId: row.encadrant_id ? String(row.encadrant_id) : null,
    referentId: row.referent_id ? String(row.referent_id) : null,
    participantIds,
  };
}

/** Produit un export complet dont la partie métier peut être réimportée telle quelle. */
export async function exportAllData(_req, res) {
  try {
    const pool = getPool();
    const entries = Object.fromEntries(await Promise.all(
      Object.entries(EXPORT_QUERIES).map(async ([key, query]) => [key, (await pool.query(query)).rows]),
    ));

    const participantIdsBySession = new Map();
    for (const row of entries.sessionParticipants) {
      const key = String(row.session_id);
      const ids = participantIdsBySession.get(key) || [];
      ids.push(String(row.participant_id));
      participantIdsBySession.set(key, ids);
    }

    const exportedAt = new Date().toISOString();
    const data = {
      exportedAt,
      version: "climbcrew-complete-export-v3",
      securityNotice: "Les mots de passe, jetons de session et jetons de réinitialisation ne sont jamais exportés.",
      participants: entries.participants.map(serializeParticipant),
      sessions: entries.sessions.map((row) => serializeSession(
        row,
        participantIdsBySession.get(String(row.id)) || [],
      )),
      ropes: entries.ropes.map(serializeRope),
      routes: entries.routes.map(serializeRoute),
      realisations: entries.realisations.map(serializeRealisation),

      // Métadonnées de maintenance. L'import métier les ignore volontairement :
      // elles permettent l'audit sans autoriser un JSON à créer/modifier un compte.
      accountMetadata: {
        users: entries.users,
        accessLogs: entries.accessLogs,
      },
    };

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="climbcrew-export-complet-${exportedAt.slice(0, 10)}.json"`,
    );
    return res.json({ ok: true, data });
  } catch (error) {
    return res.status(500).json({ error: String(error.message || error) });
  }
}
