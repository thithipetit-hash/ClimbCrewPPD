import test from "node:test";
import assert from "node:assert/strict";
import { installRealisationTechnicalAnalysisRoutes } from "../realisation-technical-analysis-routes.js";
import { listRealisationsWithPrivacy } from "../admin-users/participant-privacy-service.js";
import { setPool } from "../admin-users/database.js";

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(value) {
      this.statusCode = value;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };
}

function technicalAnalysisGetHandler(row) {
  let handler = null;
  const app = {
    get(path, ...handlers) {
      if (path === "/realisations/:id/technical-analysis") handler = handlers.at(-1);
    },
    put() {},
  };
  const pool = {
    async query() {
      return row ? { rowCount: 1, rows: [row] } : { rowCount: 0, rows: [] };
    },
  };
  installRealisationTechnicalAnalysisRoutes(app, { requireAuth: () => {}, pool });
  assert.equal(typeof handler, "function");
  return handler;
}

test("GET /realisations reste léger et ne charge pas l'analyse technique", async () => {
  let executedSql = "";
  setPool({
    async query(sql) {
      executedSql = String(sql);
      return {
        rows: [{
          id: "r1",
          participantId: "7",
          sessionId: "s1",
          voieId: "v1",
          dateRealisation: "2026-09-07",
          styleRealisation: "tete",
          commentaire: "",
          cotationProposee: "6a",
          nbEssais: "1",
          rating: 4,
          chute: false,
          assureurId: null,
          videoUrls: [],
        }],
      };
    },
  });

  const res = responseRecorder();
  await listRealisationsWithPrivacy({ auth: { user: { participantId: "7", role: "user" } } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 1);
  assert.equal("technicalAnalysis" in res.body[0], false);
  assert.doesNotMatch(executedSql, /technical_analysis/i);
});

test("la lecture dédiée respecte propriétaire, admin, profil public et profil privé", async () => {
  const analysisDocument = { version: 1, videos: { "/routes/v1/videos/a": { engineVersion: "1.0.3" } } };

  const privateHandler = technicalAnalysisGetHandler({
    participant_id: "7",
    profile_public: false,
    technical_analysis: analysisDocument,
  });

  const denied = responseRecorder();
  await privateHandler({ params: { id: "r1" }, auth: { user: { participantId: "8", role: "user" } } }, denied);
  assert.equal(denied.statusCode, 404);
  assert.deepEqual(denied.body, { error: "Réalisation introuvable" });

  const owner = responseRecorder();
  await privateHandler({ params: { id: "r1" }, auth: { user: { participantId: "7", role: "user" } } }, owner);
  assert.equal(owner.statusCode, 200);
  assert.deepEqual(owner.body.technicalAnalysis, analysisDocument);

  const admin = responseRecorder();
  await privateHandler({ params: { id: "r1" }, auth: { user: { participantId: "99", role: "admin" } } }, admin);
  assert.equal(admin.statusCode, 200);

  const publicHandler = technicalAnalysisGetHandler({
    participant_id: "7",
    profile_public: true,
    technical_analysis: analysisDocument,
  });
  const publicProfile = responseRecorder();
  await publicHandler({ params: { id: "r1" }, auth: { user: { participantId: "8", role: "user" } } }, publicProfile);
  assert.equal(publicProfile.statusCode, 200);
  assert.deepEqual(publicProfile.body.technicalAnalysis, analysisDocument);
});
