import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { findParticipantByEmailOnly } from "../admin-users/email-association-service.js";

const associationSource = await readFile(new URL("../admin-users/email-association-service.js", import.meta.url), "utf8");
const routesSource = await readFile(new URL("../admin-users/explicit-routes.js", import.meta.url), "utf8");

test("le rapprochement automatique recherche uniquement l'adresse e-mail", async () => {
  const queries = [];
  const client = {
    async query(sql, params) {
      queries.push({ sql, params });
      return { rowCount: 0, rows: [] };
    },
  };
  const result = await findParticipantByEmailOnly(client, { email: "  Test@Example.COM " });
  assert.equal(result.participantId, null);
  assert.equal(result.issue, "email_not_found");
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /login_email/);
  assert.doesNotMatch(queries[0].sql, /p\.prenom|p\.nom/);
  assert.equal(queries[0].params[0], "test@example.com");
});

test("aucun rapprochement automatique par prénom et nom n'est branché", () => {
  assert.doesNotMatch(associationSource, /lower\(trim\(p\.prenom\)\)/);
  assert.doesNotMatch(associationSource, /lower\(trim\(p\.nom\)\)/);
  assert.match(routesSource, /app\.post\("\/auth\/request-access", authRateLimit, requestAccessByEmailOnly\)/);
  assert.match(routesSource, /app\.post\("\/admin\/auth\/associations\/auto", requireEnhancementAdmin, associateExistingAccountsByEmail\)/);
});

test("une association automatique ne modifie pas le droit Administrateur de la fiche", () => {
  assert.doesNotMatch(associationSource, /set login_email = \$2,\s*can_admin/);
  assert.match(associationSource, /update participants set login_email = \$2 where id = \$1/);
});

test("le rattrapage conserve byName à zéro uniquement pour compatibilité d'interface", () => {
  assert.match(associationSource, /byName: 0/);
  assert.doesNotMatch(associationSource, /summary\.byName \+= 1/);
});
