import { GRADES } from "./validation.js";
import { parseTheCragXls } from "./thecrag-xls.js";
import { registerParticipantForSession } from "./admin-users/session-authorization-service.js";
import { getDefaultSessionStatus } from "../shared/session-default-status.js";

function normalizeTheCragToken(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeTheCragColor(value) {
  const token = normalizeTheCragToken(value);
  const aliases = {
    blanche: "blanc",
    bleue: "bleu",
    noire: "noir",
    verte: "vert",
    violette: "violet",
  };
  return aliases[token] || token;
}

function parseTheCragRouteName(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d+)[_-]([^\s-]+)(?:\s*-\s*(.*))?$/);
  if (!match) return null;
  return {
    rope: Number.parseInt(match[1], 10),
    color: normalizeTheCragColor(match[2]),
    name: normalizeTheCragToken(match[3] || ""),
  };
}

function excelSerialToIsoDate(value) {
  const serial = Number(value);
  if (!Number.isFinite(serial)) return "";
  const milliseconds = Math.round((serial - 25569) * 86400000);
  return new Date(milliseconds).toISOString().slice(0, 10);
}

function normalizeTheCragGrade(value, route) {
  const raw = String(value || "").trim().toLowerCase().replace(/\s+/g, "");
  const direct = GRADES.find((grade) => grade.toLowerCase() === raw);
  if (direct) return direct;
  const match = raw.match(/^(4|[5-7][abc]\+?)/);
  if (match && GRADES.includes(match[1])) return match[1];
  const routeGrade = String(route?.cotation_ajustee || route?.cotation_reference || "").trim();
  return GRADES.includes(routeGrade) ? routeGrade : "";
}

function mapTheCragCriterion(value) {
  const type = normalizeTheCragToken(value);
  if (type.includes("onsight")) return "a_vue";
  if (type.includes("flash")) return "flash";
  if (type.includes("hang dog")) return "avec_repos";
  if (type.includes("attempt")) return "non_enchainee";
  if (type.includes("project")) return "projet";
  if (type.includes("clean") || type.includes("pink point") || type.includes("red point")) return "travaillee";
  return "travaillee";
}

function mapTheCragMode(value) {
  const gear = normalizeTheCragToken(value);
  return gear.includes("moulinette") || gear.includes("en second") ? "moulinette" : "en_tete";
}

function findTheCragRoute(routes, row) {
  const parsed = parseTheCragRouteName(row["Route Name"]);
  if (!parsed) return null;
  const candidates = routes.filter((route) => (
    Number(route.numero_corde) === parsed.rope
    && normalizeTheCragColor(route.couleur_prises) === parsed.color
  ));
  if (candidates.length <= 1) return candidates[0] || null;
  if (!parsed.name) return candidates[0];
  return candidates.find((route) => normalizeTheCragToken(route.nom_voie) === parsed.name)
    || candidates.find((route) => normalizeTheCragToken(route.nom_voie).includes(parsed.name))
    || candidates[0];
}

async function ensureTheCragMiddaySession(client, participantId, date) {
  const existing = await client.query(
    `
      select id
      from sessions
      where date = $1 and slot = 'midi'
      order by case when status in ('encadree','libre','passeport','challenge','renouvellement') then 0 else 1 end, id
      limit 1
    `,
    [date],
  );
  let sessionId = existing.rows[0]?.id || "";
  let created = false;
  if (!sessionId) {
    sessionId = `thecrag-${date}-midi`;
    const defaultStatus = getDefaultSessionStatus(date, "midi");
    const insertSession = await client.query(
      `
        insert into sessions (id, date, slot, status)
        values ($1, $2, 'midi', $3)
        on conflict (id) do nothing
        returning id
      `,
      [sessionId, date, defaultStatus],
    );
    created = insertSession.rowCount > 0;
  }

  const registration = await registerParticipantForSession(client, {
    sessionId,
    participantId: String(participantId),
  });
  return { sessionId, created, registered: registration.registered };
}

export async function importTheCragRealisations({ pool, participantId, buffer, startDate }) {
  const rows = parseTheCragXls(buffer);
  const client = await pool.connect();

  try {
    await client.query("begin");

    const participantResult = await client.query(
      "select cotisation from participants where id::text = $1 limit 1",
      [String(participantId)],
    );
    if (!participantResult.rows[0]?.cotisation) {
      const error = new Error("Le grimpeur doit être cotisant pour importer des réalisations.");
      error.status = 403;
      throw error;
    }

    const routesResult = await client.query(
      `
        select id, numero_corde, couleur_prises, nom_voie, cotation_reference, cotation_ajustee
        from routes
        where active = true
      `,
    );
    const activeRoutes = routesResult.rows;
    const sessionCache = new Map();
    let imported = 0;
    let duplicates = 0;
    let unmatched = 0;
    let invalid = 0;
    let sessionsCreated = 0;
    let registrationsAdded = 0;
    let filteredBeforeStart = 0;
    const unmatchedRoutes = new Set();

    for (const row of rows) {
      const date = excelSerialToIsoDate(row["Ascent Date"]);
      const ascentId = String(row["Ascent ID"] || "").replace(/\.0$/, "").trim();
      if (!date || !ascentId) {
        invalid += 1;
        continue;
      }
      if (date < startDate) {
        filteredBeforeStart += 1;
        continue;
      }

      const route = findTheCragRoute(activeRoutes, row);
      if (!route) {
        unmatched += 1;
        unmatchedRoutes.add(String(row["Route Name"] || "Voie inconnue"));
        continue;
      }

      let session = sessionCache.get(date);
      if (!session) {
        session = await ensureTheCragMiddaySession(client, participantId, date);
        sessionCache.set(date, session);
        if (session.created) sessionsCreated += 1;
        if (session.registered) registrationsAdded += 1;
      }

      const id = `thecrag-${participantId}-${ascentId}`;
      const criterion = mapTheCragCriterion(row["Ascent Type"]);
      const mode = mapTheCragMode(row["Ascent Gear Style"]);
      const commentParts = [
        String(row.Comment || "").trim(),
        row.With ? `Avec : ${String(row.With).trim()}` : "",
        `Import theCrag · ascent ${ascentId}`,
      ].filter(Boolean);

      const result = await client.query(
        `
          insert into realisations (
            id, participant_id, session_id, voie_id, date_realisation, style_realisation,
            commentaire, cotation_proposee, nb_essais, mode_realisation, chute, assureur_id
          ) values ($1,$2,$3,$4,$5,$6,$7,$8,null,$9,false,null)
          on conflict (id) do nothing
          returning id
        `,
        [
          id,
          String(participantId),
          session.sessionId,
          route.id,
          date,
          criterion,
          commentParts.join(" · "),
          normalizeTheCragGrade(row["Ascent Grade"] || row["Route Grade"], route),
          mode,
        ],
      );
      if (result.rowCount) imported += 1;
      else duplicates += 1;
    }

    await client.query("commit");
    return {
      ok: true,
      total: rows.length,
      imported,
      duplicates,
      unmatched,
      invalid,
      sessionsCreated,
      registrationsAdded,
      filteredBeforeStart,
      startDate,
      unmatchedRoutes: [...unmatchedRoutes].slice(0, 20),
    };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
