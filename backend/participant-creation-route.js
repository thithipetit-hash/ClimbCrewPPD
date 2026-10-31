import { validateParticipantPayload } from "./validation.js";
import { getFfmeAgeCategory } from "../shared/ffme-age-categories.js";

function participantDbToApi(row) {
  return {
    id: String(row.id),
    nom: row.nom,
    prenom: row.prenom,
    email: row.email || "",
    passport: row.passport,
    passportDecouverte: Boolean(row.passport_decouverte),
    passeportFfme: Boolean(row.passeport_ffme),
    sexe: row.sexe || "",
    anneeNaissance: row.annee_naissance ?? null,
    categorieFfme: getFfmeAgeCategory(row.annee_naissance),
    cotisation: row.cotisation,
    ffme: row.ffme,
    canEncadrer: row.can_encadrer,
    canReferer: row.can_referer,
    canAdmin: row.can_admin,
    avatarId: row.avatar_id || "gecko",
    crestId: row.crest_id || "cristal",
    profilePublic: row.profile_public !== false,
    customAvatarImage: row.custom_avatar_image || "",
  };
}

/** Installe la création administrateur d'une fiche participant. */
export function installParticipantCreationRoute(app, { requireAuth, requireAdmin, pool }) {
  app.post("/participants", requireAuth, requireAdmin, async (req, res) => {
    try {
      const {
        nom,
        prenom,
        email,
        passport,
        passportDecouverte,
        passeportFfme,
        sexe,
        anneeNaissance,
        cotisation,
        ffme,
        canEncadrer,
        canReferer,
        canAdmin,
        avatarId = "gecko",
        crestId = "cristal",
        profilePublic = true,
      } = validateParticipantPayload(req.body || {});

      const result = await pool.query(
        `
          insert into participants
          (nom, prenom, email, passport, passport_decouverte, passeport_ffme, sexe, cotisation, ffme, can_encadrer, can_referer, can_admin, avatar_id, crest_id, profile_public, annee_naissance)
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
          returning id, nom, prenom, email, passport, passport_decouverte, passeport_ffme, sexe, cotisation, ffme, can_encadrer, can_referer, can_admin, avatar_id, crest_id, profile_public, annee_naissance
        `,
        [
          nom,
          prenom,
          String(email || "").trim().toLowerCase(),
          passport,
          passportDecouverte,
          passeportFfme,
          sexe,
          cotisation,
          ffme,
          canEncadrer,
          canReferer,
          canAdmin,
          avatarId,
          crestId,
          profilePublic,
          anneeNaissance,
        ]
      );

      res.status(201).json(participantDbToApi(result.rows[0]));
    } catch (error) {
      res.status(error.status || 500).json({
        error: error.message || String(error),
        fields: error.fields || undefined,
      });
    }
  });
}
