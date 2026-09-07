import test from "node:test";
import assert from "node:assert/strict";
import { parseRealisationsWindow } from "../admin-users/participant-privacy-service.js";

test("sans paramètres la liste des réalisations conserve le contrat historique", () => {
  assert.deepEqual(parseRealisationsWindow({}), {
    paginated: false,
    limit: null,
    offset: 0,
  });
});

test("limit et offset définissent une fenêtre bornée", () => {
  assert.deepEqual(parseRealisationsWindow({ limit: "50", offset: "100" }), {
    paginated: true,
    limit: 50,
    offset: 100,
  });
});

test("la pagination refuse les valeurs ambiguës ou trop grandes", () => {
  assert.throws(() => parseRealisationsWindow({ offset: "10" }), /offset nécessite/);
  assert.throws(() => parseRealisationsWindow({ limit: "0" }), /limit doit être/);
  assert.throws(() => parseRealisationsWindow({ limit: "201" }), /limit doit être/);
  assert.throws(() => parseRealisationsWindow({ limit: "20", offset: "-1" }), /offset doit être/);
});
