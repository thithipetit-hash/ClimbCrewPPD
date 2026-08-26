import { getPool } from "./database.js";
import { writeAccessLog } from "./access-log-service.js";
import { cleanEmail, emailMatchKey } from "./security.js";
import { validateLegacyImportPayload, ValidationError } from "../validation.js";

function actorId(req) {
  return req.auth?.user?.id || req.enhancementAuth?.user?.id || null;
}

function actorEmail(req) {
  return req.auth?.user?.email || req.enhancementAuth?.user?.email || null;
}

function normalizedParticipantEmails(participants = []) {
  const counts = new Map();
  for (const participant of participants) {
    const email = emailMatchKey(participant.email);
    if (!email) continue;
    counts.set(email, (counts.get(email) || 0) + 1);
  }
  return counts;
}

/**
 * Vérifications faites avant toute suppression de données métier.
 *
 * - une adresse importée ne peut désigner qu'une seule fiche ;
 * - chaque administrateur actif existant doit retrouver exactement une fiche par
 *   son adresse e-mail. On refuse donc l'import plutôt que de créer un compte
 *   administrateur orphelin ou de tenter une association par le nom.
 */
async function preflightAccountAssociations(client, payload) {
  const emailCounts = normalizedParticipantEmails(payload.participants || []);
  const duplicateEmails = [...emailCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([email]) => email);

  if (duplicateEmails.length) {
    const error = new Error(
      `Import refusé : ${duplicateEmails.length} adresse(s) e-mail sont présentes sur plusieurs fiches.`,
    );
    error.status = 409;
    throw error;
  }

  const adminsResult = await client.query(`
    select id, email
    from users
    where status = 'active'
      and (role = 'admin' or is_admin = true)
    order by id asc
    for update
  `);

  const missingAdminEmails = adminsResult.rows
    .map((user) => emailMatchKey(user.email))
    .filter((email) => !email || emailCounts.get(email) !== 1);

  if (missingAdminEmails.length) {
    const error = new Error(
      "Import refusé : chaque administrateur actif doit correspondre à une fiche importée portant exactement son adresse e-mail.",
    );
    error.status = 409;
    throw error;
  }

  return {
    activeAdminCount: adminsResult.rowCount,
    participantEmailCount: emailCounts.size,
  };
}

async function rebuildAccountAssociationsByEmail(client) {
  // La suppression des participants met les anciennes associations à NULL via
  // la clé étrangère. Aucune recherche par prénom/nom n'est autorisée ici.
  const linkedResult = await client.query(`
    with candidate_matches as (
      select u.id as user_id, p.id as participant_id
      from users u
      join participants p
        on trim(coalesce(p.login_email, p.email, '')) <> ''
       and climbcrew_normalize_email(coalesce(p.login_email, p.email, '')) = climbcrew_normalize_email(u.email)
    ), unique_matches as (
      select user_id, min(participant_id) as participant_id
      from candidate_matches
      group by user_id
      having count(*) = 1
    )
    update users u
    set participant_id = matches.participant_id
    from unique_matches matches
    where u.id = matches.user_id
    returning u.id, u.participant_id
  `);

  // Un droit Administrateur ne vient jamais du fichier JSON. Il est reconstruit
  // exclusivement depuis le compte déjà existant. Les fiches sans compte lié
  // restent donc non administratrices.
  await client.query(`update participants set can_admin = false`);
  await client.query(`
    update participants p
    set can_admin = (u.role = 'admin' or u.is_admin = true),
        login_email = lower(trim(u.email)),
        email = lower(trim(u.email))
    from users u
    where u.participant_id = p.id
  `);

  return linkedResult.rowCount;
}

/**
 * Import administrateur sécurisé des données métier.
 *
 * Les comptes, mots de passe, rôles et sessions d'authentification ne sont jamais
 * importés depuis le JSON. `canAdmin` est volontairement ignoré, même s'il était
 * présent dans un ancien export. Le rapprochement compte <-> fiche repose
 * uniquement sur l'adresse e-mail normalisée et unique.
 */
export async function importBusinessDataSafely(req, res) {
  let payload;
  try {
    payload = validateLegacyImportPayload(req.body || {});
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message, fields: error.fields });
    }
    return res.status(400).json({ error: "Fichier d'import invalide" });
  }

  const client = await getPool().connect();
  try {
    await client.query("begin");
    const preflight = await preflightAccountAssociations(client, payload);

    await client.query("delete from session_participants");
    await client.query("delete from realisations");
    await client.query("delete from sessions");
    await client.query("delete from routes");
    await client.query("delete from ropes");
    await client.query("delete from participants");

    for (const rope of payload.ropes || []) {
      await client.query(
        `
          insert into ropes (numero_corde, actif, couleur_corde)
          values ($1,$2,$3)
          on conflict (numero_corde) do update set
            actif = excluded.actif,
            couleur_corde = excluded.couleur_corde,
            updated_at = now()
        `,
        [Number(rope.numeroCorde), rope.actif !== false, String(rope.couleurCorde || "")],
      );
    }

    const participantIdMap = new Map();
    for (const participant of payload.participants || []) {
      const result = await client.query(
        `
          insert into participants (
            nom, prenom, email, login_email, passport, sexe, cotisation, ffme,
            initiateur_sae, initiateur_sne, can_encadrer, can_referer, can_admin,
            avatar_id, crest_id, profile_public, custom_avatar_image
          )
          values ($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10,$11,false,$12,$13,$14,$15)
          returning id
        `,
        [
          String(participant.nom || "").trim() || "?",
          String(participant.prenom || "").trim() || "?",
          cleanEmail(participant.email),
          String(participant.passport || "sans").trim() || "sans",
          String(participant.sexe || "").trim().toLowerCase(),
          Boolean(participant.cotisation),
          Boolean(participant.ffme),
          Boolean(participant.initiateurSae ?? participant.initiateur_sae),
          Boolean(participant.initiateurSne ?? participant.initiateur_sne),
          Boolean(participant.canEncadrer),
          Boolean(participant.canReferer),
          String(participant.avatarId || participant.avatar_id || "gecko"),
          String(participant.crestId || participant.crest_id || "cristal"),
          participant.profilePublic !== false && participant.profile_public !== false,
          String(participant.customAvatarImage || participant.custom_avatar_image || ""),
        ],
      );
      participantIdMap.set(String(participant.id), String(result.rows[0].id));
    }

    const accountsReassociated = await rebuildAccountAssociationsByEmail(client);

    for (const route of payload.routes || []) {
      await client.query(
        `
          insert into routes (
            id, numero_voie_unique, numero_corde, couleur_prises, cotation_reference,
            cotation_ajustee, nom_voie, nom_ouvreur, moulinette_only, active, date_creation, tags
          ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
          on conflict (id) do update set
            numero_voie_unique = excluded.numero_voie_unique,
            numero_corde = excluded.numero_corde,
            couleur_prises = excluded.couleur_prises,
            cotation_reference = excluded.cotation_reference,
            cotation_ajustee = excluded.cotation_ajustee,
            nom_voie = excluded.nom_voie,
            nom_ouvreur = excluded.nom_ouvreur,
            moulinette_only = excluded.moulinette_only,
            active = excluded.active,
            date_creation = excluded.date_creation,
            tags = excluded.tags,
            updated_at = now()
        `,
        [
          String(route.id || `route-${route.numeroVoieUnique || Date.now()}`),
          String(route.numeroVoieUnique || route.id || ""),
          Number(route.numeroCorde),
          String(route.couleurPrises || ""),
          String(route.cotationReference || ""),
          String(route.cotationAjustee || route.cotationReference || ""),
          String(route.nomVoie || ""),
          String(route.nomOuvreur || ""),
          Boolean(route.moulinetteOnly),
          route.active !== false,
          String(route.dateCreation || ""),
          route.tags || [],
        ],
      );
    }

    for (const session of payload.sessions || []) {
      const mappedEncadrantId = session.encadrantId
        ? participantIdMap.get(String(session.encadrantId)) || null
        : null;
      const mappedReferentId = session.referentId
        ? participantIdMap.get(String(session.referentId)) || null
        : null;

      await client.query(
        `
          insert into sessions (id, date, slot, status, encadrant_id, referent_id)
          values ($1,$2,$3,$4,$5,$6)
          on conflict (id) do update set
            date = excluded.date,
            slot = excluded.slot,
            status = excluded.status,
            encadrant_id = excluded.encadrant_id,
            referent_id = excluded.referent_id,
            updated_at = now()
        `,
        [
          String(session.id),
          String(session.date || ""),
          String(session.slot || "midi"),
          String(session.status || "fermee"),
          mappedEncadrantId,
          mappedReferentId,
        ],
      );

      const uniqueParticipantIds = [
        ...new Set(
          (session.participantIds || [])
            .map((id) => participantIdMap.get(String(id)))
            .filter(Boolean),
        ),
      ];

      for (const mappedParticipantId of uniqueParticipantIds) {
        await client.query(
          `
            insert into session_participants (session_id, participant_id)
            values ($1,$2)
            on conflict do nothing
          `,
          [String(session.id), mappedParticipantId],
        );
      }
    }

    for (const realisation of payload.realisations || []) {
      const mappedParticipantId = participantIdMap.get(String(realisation.participantId));
      if (!mappedParticipantId) continue;
      const mappedAssureurId = realisation.assureurId
        ? participantIdMap.get(String(realisation.assureurId)) || null
        : null;

      await client.query(
        `
          insert into realisations (
            id, participant_id, session_id, voie_id, date_realisation, style_realisation,
            commentaire, cotation_proposee, nb_essais, rating, chute, assureur_id
          ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
          on conflict (id) do update set
            participant_id = excluded.participant_id,
            session_id = excluded.session_id,
            voie_id = excluded.voie_id,
            date_realisation = excluded.date_realisation,
            style_realisation = excluded.style_realisation,
            commentaire = excluded.commentaire,
            cotation_proposee = excluded.cotation_proposee,
            nb_essais = excluded.nb_essais,
            rating = excluded.rating,
            chute = excluded.chute,
            assureur_id = excluded.assureur_id,
            updated_at = now()
        `,
        [
          String(realisation.id || `real-${Date.now()}-${Math.random().toString(16).slice(2)}`),
          mappedParticipantId,
          String(realisation.sessionId || ""),
          String(realisation.voieId || ""),
          String(realisation.dateRealisation || ""),
          String(realisation.styleRealisation || ""),
          realisation.commentaire || "",
          realisation.cotationProposee || "",
          realisation.nbEssais || "",
          realisation.rating || null,
          Boolean(realisation.chute),
          mappedAssureurId,
        ],
      );
    }

    await client.query("commit");

    const summary = {
      ok: true,
      message: "Import métier terminé. Les droits administrateur du fichier ont été ignorés.",
      participantsImported: payload.participants?.length || 0,
      sessionsImported: payload.sessions?.length || 0,
      ropesImported: payload.ropes?.length || 0,
      routesImported: payload.routes?.length || 0,
      realisationsImported: payload.realisations?.length || 0,
      accountsReassociated,
      adminRightsImported: 0,
      activeAdminsProtected: preflight.activeAdminCount,
    };

    await writeAccessLog({
      userId: actorId(req),
      eventType: "business_data_imported_safely",
      success: true,
      req,
      details: { ...summary, changedBy: actorEmail(req) },
    });

    return res.json(summary);
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    console.error("Import métier sécurisé impossible :", error);
    return res.status(error.status || 500).json({
      error: error.status ? error.message : "Import des données impossible",
    });
  } finally {
    client.release();
  }
}
