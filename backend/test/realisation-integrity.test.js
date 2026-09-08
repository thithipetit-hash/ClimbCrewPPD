import test from "node:test";
import assert from "node:assert/strict";
import { assertRealisationIntegrity } from "../realisation-integrity.js";

function poolFor({ route = true, session = true, cotisation = true, belayer = true } = {}) {
  const queries = [];
  return {
    queries,
    async query(sql) {
      queries.push(sql);
      if (sql.includes("from routes")) return { rowCount: route ? 1 : 0, rows: route ? [{ id: "r1" }] : [] };
      if (sql.includes("select s.date, p.cotisation")) {
        return { rowCount: session ? 1 : 0, rows: session ? [{ date: "2026-08-29", cotisation }] : [] };
      }
      if (sql.includes("select 1") && sql.includes("session_participants")) {
        return { rowCount: belayer ? 1 : 0, rows: belayer ? [{ ok: 1 }] : [] };
      }
      throw new Error(`Requête inattendue: ${sql}`);
    },
  };
}

const base = { sessionId: "s1", voieId: "r1", dateRealisation: "2026-08-29", chute: false, assureurId: "" };

test("une réalisation exige une voie existante", async () => {
  await assert.rejects(
    assertRealisationIntegrity({ pool: poolFor({ route: false }), realisation: base, participantId: "1" }),
    /voie sélectionnée n'existe pas/,
  );
});

test("une réalisation exige l'inscription du grimpeur à la séance", async () => {
  await assert.rejects(
    assertRealisationIntegrity({ pool: poolFor({ session: false }), realisation: base, participantId: "1" }),
    /inscrit à la séance/,
  );
});

test("la validation reste compatible avec session_participants.participant_id en bigint", async () => {
  const pool = poolFor();
  await assert.doesNotReject(
    assertRealisationIntegrity({ pool, realisation: base, participantId: "1" }),
  );

  const sessionSql = pool.queries.find((sql) => sql.includes("select s.date, p.cotisation"));
  assert.match(sessionSql, /sp\.participant_id::text = \$2/);
  assert.doesNotMatch(sessionSql, /p\.id::text\s*=\s*sp\.participant_id/);
});

test("la date doit être celle de la séance", async () => {
  await assert.rejects(
    assertRealisationIntegrity({ pool: poolFor(), realisation: { ...base, dateRealisation: "2026-08-28" }, participantId: "1" }),
    /date de réalisation/,
  );
});

test("un vol exige un assureur distinct inscrit à la même séance", async () => {
  await assert.rejects(
    assertRealisationIntegrity({ pool: poolFor(), realisation: { ...base, chute: true, assureurId: "1" }, participantId: "1" }),
    /propre assureur/,
  );
  await assert.rejects(
    assertRealisationIntegrity({ pool: poolFor({ belayer: false }), realisation: { ...base, chute: true, assureurId: "2" }, participantId: "1" }),
    /même séance/,
  );

  const pool = poolFor();
  await assert.doesNotReject(
    assertRealisationIntegrity({ pool, realisation: { ...base, chute: true, assureurId: "2" }, participantId: "1" }),
  );
  const belayerSql = pool.queries.find((sql) => sql.includes("select 1") && sql.includes("session_participants"));
  assert.match(belayerSql, /sp\.participant_id::text = \$2/);
});
