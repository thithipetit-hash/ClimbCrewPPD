import { getPool } from "./database.js";

// Marqueur compact conservé pour compatibilité avec le flux de mise à jour du
// frontend. Il remplace l'ancien contenu Base64 dans les réponses JSON.
export const REMOTE_CUSTOM_AVATAR_MARKER = "remote";

function avatarMetadata(row, visible = true) {
  const hasCustomAvatar = Boolean(
    visible && (row.has_custom_avatar ?? Boolean(row.custom_avatar_image)),
  );
  return {
    hasCustomAvatar,
    customAvatarImage: hasCustomAvatar ? REMOTE_CUSTOM_AVATAR_MARKER : "",
  };
}

/**
 * Sérialisation complète d'un grimpeur, réservée à son propre compte et aux
 * administrateurs. `login_email` est prioritaire : `email` reste une colonne
 * de compatibilité pendant la transition du modèle de données.
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
    initiateurSae: Boolean(row.initiateur_sae),
    initiateurSne: Boolean(row.initiateur_sne),
    canEncadrer: Boolean(row.can_encadrer),
    canReferer: Boolean(row.can_referer),
    canAdmin: Boolean(row.can_admin),
    avatarId: row.avatar_id || "gecko",
    crestId: row.crest_id || "cristal",
    profilePublic: row.profile_public !== false,
    ...avatarMetadata(row),
  };
}

/**
 * Vue d'un profil public pour les autres membres.
 *
 * Le profil d'escalade peut être consulté, y compris son avatar et sa
 * progression. Le passeport, l'état de cotisation, le statut FFME et les
 * qualifications fédérales affichées par badge sont partagés entre membres
 * authentifiés ; les coordonnées et droits administrateur restent privés.
 */
export function serializePublicParticipant(row) {
  return {
    id: String(row.id),
    nom: row.nom,
    prenom: row.prenom,
    email: "",
    passport: row.passport,
    sexe: row.sexe,
    cotisation: Boolean(row.cotisation),
    ffme: Boolean(row.ffme),
    initiateurSae: Boolean(row.initiateur_sae),
    initiateurSne: Boolean(row.initiateur_sne),
    canEncadrer: Boolean(row.can_encadrer),
    canReferer: Boolean(row.can_referer),
    canAdmin: false,
    avatarId: row.avatar_id || "gecko",
    crestId: row.crest_id || "cristal",
    profilePublic: true,
    ...avatarMetadata(row),
  };
}

/**
 * Vue minimale d'un profil privé.
 *
 * Le nom, le passeport, l'état de cotisation, le statut FFME et les rôles
 * opérationnels restent disponibles afin que la vie du club et les inscriptions
 * continuent de fonctionner. Les qualifications et les données de progression
 * ne sont pas exposées lorsqu'un profil est privé.
 */
export function serializePrivateParticipant(row) {
  return {
    id: String(row.id),
    nom: row.nom,
    prenom: row.prenom,
    email: "",
    passport: row.passport,
    sexe: "",
    cotisation: Boolean(row.cotisation),
    ffme: Boolean(row.ffme),
    initiateurSae: false,
    initiateurSne: false,
    canEncadrer: Boolean(row.can_encadrer),
    canReferer: Boolean(row.can_referer),
    canAdmin: false,
    avatarId: "gecko",
    crestId: "cristal",
    profilePublic: false,
    ...avatarMetadata(row, false),
  };
}

/**
 * Remplace GET /participants du serveur historique.
 *
 * Le Base64 n'est plus sélectionné ni renvoyé dans la liste. Seul un booléen
 * indique qu'une image personnalisée existe ; l'image elle-même passe par
 * GET /participants/:id/avatar.
 *
 * - administrateur ou propriétaire : vue complète ;
 * - autre membre + profil public : profil d'escalade sans données privées ;
 * - autre membre + profil privé : vue opérationnelle minimale.
 */
export async function listParticipantsWithPrivacy(req, res) {
  try {
    const result = await getPool().query(`
      select
        id, nom, prenom, email, login_email, passport, sexe, cotisation, ffme,
        initiateur_sae, initiateur_sne,
        can_encadrer, can_referer, can_admin, avatar_id, crest_id,
        profile_public,
        (coalesce(custom_avatar_image, '') <> '') as has_custom_avatar
      from participants
      order by prenom asc, nom asc
    `);

    const ownParticipantId = String(req.auth?.user?.participantId || "");
    const isAdmin = req.auth?.user?.role === "admin";

    res.json(result.rows.map((row) => {
      const isOwnProfile = String(row.id) === ownParticipantId;
      if (isAdmin || isOwnProfile) return serializeParticipant(row);
      if (row.profile_public !== false) return serializePublicParticipant(row);
      return serializePrivateParticipant(row);
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
 * Les casts vers text maintiennent la compatibilité pendant la migration des
 * identifiants participants de text vers bigint.
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
          r.assureur_id as "assureurId",
          r.video_urls as "videoUrls"
        from realisations r
        left join participants p on p.id::text = r.participant_id::text
        where $1::boolean = true
           or r.participant_id::text = $2
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
