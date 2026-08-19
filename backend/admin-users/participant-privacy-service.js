import { getPool } from "./database.js";

/**
 * Sérialisation complète d'un grimpeur, réservée à son propre compte, aux
 * administrateurs et aux profils ayant explicitement choisi d'être publics.
 * `login_email` est prioritaire : `email` reste une colonne de compatibilité.
 */
export function serializeParticipant(row) {
  return {
    id: String(row.id),
    nom: row.nom,
    prenom: row.prenom,
    email: row.login_email || row.email || "",
    passport: row.passport,
    sexe: row.sexe,
    cotisation: Boolean(row.cotisation),
    ffme: Boolean(row.ffme),
    canEncadrer: Boolean(row.can_encadrer),
    canReferer: Boolean(row.can_referer),
    canAdmin: Boolean(row.can_admin),
    avatarId: row.avatar_id || "gecko",
    crestId: row.crest_id || "cristal",
    profilePublic: row.profile_public !== false,
    customAvatarImage: row.custom_avatar_image || "",
  };
}

/**
 * Vue minimale d'un profil privé.
 *
 * Le nom, le passeport et les rôles opérationnels restent disponibles afin que
 * les inscriptions et l'identification d'un encadrant/référent continuent de
 * fonctionner. Les coordonnées, informations administratives, sexe, droits
 * d'administration, avatar personnalisé et progression ne sont pas exposés.
 */
export function serializePrivateParticipant(row) {
  return {
    id: String(row.id),
    nom: row.nom,
    prenom: row.prenom,
    email: "",
    passport: row.passport,
    sexe: "",
    cotisation: false,
    ffme: false,
    canEncadrer: Boolean(row.can_encadrer),
    canReferer: Boolean(row.can_referer),
    canAdmin: false,
    avatarId: "gecko",
    crestId: "cristal",
    profilePublic: false,
    customAvatarImage: "",
  };
}

/**
 * Remplace GET /participants du serveur historique.
 * Un membre voit son propre profil complet ; un administrateur voit tout ; les
 * autres membres ne reçoivent qu'une vue minimale des profils privés.
 */
export async function listParticipantsWithPrivacy(req, res) {
  try {
    const result = await getPool().query(`
      select
        id, nom, prenom, email, login_email, passport, sexe, cotisation, ffme,
        can_encadrer, can_referer, can_admin, avatar_id, crest_id,
        profile_public, custom_avatar_image
      from participants
      order by prenom asc, nom asc
    `);

    const ownParticipantId = String(req.auth?.user?.participantId || "");
    const isAdmin = req.auth?.user?.role === "admin";

    res.json(result.rows.map((row) => {
      const canSeeFullProfile = isAdmin
        || row.profile_public !== false
        || String(row.id) === ownParticipantId;
      return canSeeFullProfile
        ? serializeParticipant(row)
        : serializePrivateParticipant(row);
    }));
  } catch (error) {
    console.error("GET /participants privacy", error);
    res.status(500).json({ error: "Chargement des grimpeurs impossible" });
  }
}

/**
 * Remplace GET /realisations du serveur historique.
 *
 * Les réalisations constituent la progression personnelle : celles d'un profil
 * privé ne sont donc visibles que par leur propriétaire et les administrateurs.
 * Les agrégats anonymisés des voies restent calculés par /routes comme avant.
 */
export async function listRealisationsWithPrivacy(req, res) {
  try {
    const ownParticipantId = String(req.auth?.user?.participantId || "");
    const isAdmin = req.auth?.user?.role === "admin";

    const result = await getPool().query(
      `
        select
          r.id,
          r.participant_id as "participantId",
          r.session_id as "sessionId",
          r.voie_id as "voieId",
          r.date_realisation as "dateRealisation",
          r.style_realisation as "styleRealisation",
          r.commentaire,
          r.cotation_proposee as "cotationProposee",
          r.nb_essais as "nbEssais",
          r.rating,
          r.chute,
          r.assureur_id as "assureurId"
        from realisations r
        left join participants p on p.id::text = r.participant_id
        where $1::boolean = true
           or r.participant_id = $2
           or coalesce(p.profile_public, false) = true
        order by r.date_realisation desc, r.created_at desc
      `,
      [isAdmin, ownParticipantId],
    );

    res.json(result.rows);
  } catch (error) {
    console.error("GET /realisations privacy", error);
    res.status(500).json({ error: "Chargement des réalisations impossible" });
  }
}
