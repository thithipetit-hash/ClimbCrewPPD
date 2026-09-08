import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRuntimeConfig, createDatabasePool } from "../config/runtime-config.js";

const DEFAULT_IMPORT_FILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "import-data.json",
);

function argumentValue(name) {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) || "";
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

export async function importLegacyData(pool, payload) {
  const client = await pool.connect();
  try {
    await client.query("begin");

    await client.query("delete from session_participants");
    await client.query("delete from sessions");
    await client.query("delete from realisations");
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
          insert into participants
          (nom, prenom, email, passport, sexe, cotisation, ffme, can_encadrer, can_referer, can_admin)
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          returning id
        `,
        [
          participant.nom,
          participant.prenom,
          String(participant.email || "").trim().toLowerCase(),
          participant.passport || "sans",
          String(participant.sexe || "").trim().toLowerCase(),
          Boolean(participant.cotisation),
          Boolean(participant.ffme),
          Boolean(participant.canEncadrer),
          Boolean(participant.canReferer),
          Boolean(participant.canAdmin),
        ],
      );

      participantIdMap.set(String(participant.id), String(result.rows[0].id));
    }

    for (const route of payload.routes || []) {
      await client.query(
        `
          insert into routes (
            id, numero_voie_unique, numero_corde, couleur_prises, cotation_reference,
            cotation_ajustee, nom_voie, nom_ouvreur, moulinette_only, active, date_creation
          ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
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
            updated_at = now()
        `,
        [
          route.id,
          route.numeroVoieUnique,
          Number(route.numeroCorde),
          route.couleurPrises || "",
          route.cotationReference || "",
          route.cotationAjustee || route.cotationReference || "",
          route.nomVoie || "",
          route.nomOuvreur || "",
          Boolean(route.moulinetteOnly),
          route.active !== false,
          route.dateCreation || "",
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
        [session.id, session.date, session.slot, session.status || "fermee", mappedEncadrantId, mappedReferentId],
      );

      const uniqueParticipantIds = [
        ...new Set((session.participantIds || []).map((id) => participantIdMap.get(String(id))).filter(Boolean)),
      ];

      for (const mappedParticipantId of uniqueParticipantIds) {
        await client.query(
          `
            insert into session_participants (session_id, participant_id)
            values ($1,$2)
            on conflict do nothing
          `,
          [session.id, mappedParticipantId],
        );
      }
    }

    await client.query("commit");
    return {
      participantsImported: payload.participants?.length || 0,
      sessionsImported: payload.sessions?.length || 0,
      ropesImported: payload.ropes?.length || 0,
      routesImported: payload.routes?.length || 0,
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  const confirm = argumentValue("confirm");
  if (confirm !== "oui") {
    throw new Error("Import annulé. Relancer avec --confirm=oui après vérification de l'export et de la sauvegarde.");
  }

  const config = createRuntimeConfig();
  if (config.isProduction && !hasFlag("allow-production")) {
    throw new Error("Import en production refusé sans le drapeau supplémentaire --allow-production.");
  }

  const importFile = path.resolve(argumentValue("file") || DEFAULT_IMPORT_FILE);
  const payload = JSON.parse(await readFile(importFile, "utf8"));
  const pool = createDatabasePool(config);

  try {
    const result = await importLegacyData(pool, payload);
    console.log(JSON.stringify({ ok: true, importFile, ...result }, null, 2));
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Import legacy impossible : ${error.message || error}`);
    process.exitCode = 1;
  });
}
