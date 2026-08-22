import express from "express";
import {
  CSRF_BRIDGE_FLAG,
  EXPRESS_PATCH_FLAG,
  INSTALL_FLAG,
} from "./config.js";
import { ensureAdminUserSchema } from "./database.js";
import {
  changePassword,
  confirmEmailChange,
  forgotPassword,
  listUsers,
  requestEmailChange,
  updateAdminRight,
  verifyEmailRequest,
} from "./account-service.js";
import {
  associateExistingAccounts,
  requestAccessWithAssociations,
  setUserParticipantAssociation,
} from "./association-service.js";
import { exportAllData } from "./export-service.js";
import {
  listParticipantsWithPrivacy,
  listRealisationsWithPrivacy,
} from "./participant-privacy-service.js";
import { updateSessionWithAuthorization } from "./session-authorization-service.js";
import { startAccessLogRetentionScheduler } from "./access-log-retention.js";
import { requireAdmin, requireAuthUser } from "./security.js";
import { createCrossOriginCsrfBridge } from "../deployment-compatibility.js";
import { installBackupRoutes } from "../backup-routes.js";
import { startBackupScheduler } from "../backup-service.js";

/**
 * Intégration des modules séparés dans l'application Express historique.
 *
 * Rôle : conserver les URL déjà utilisées par le frontend tout en remplaçant
 * certains contrôleurs par des versions plus robustes et mieux découpées.
 *
 * Impact visuel : les écrans restent identiques. Les changements se voient
 * uniquement par une meilleure fiabilité des demandes de compte, de la gestion
 * administrateur et des actions effectuées depuis un frontend Render séparé.
 */

/**
 * Remplace uniquement le dernier gestionnaire d'une route.
 * Les middlewares déjà déclarés dans server.js, comme l'authentification et la
 * limitation de débit, restent ainsi actifs et dans le même ordre.
 */
function replaceLastHandler(originalMethod, app, path, handlers, replacement) {
  const middlewares = handlers.slice(0, -1);
  return originalMethod.call(app, path, ...middlewares, replacement);
}

/**
 * Installe les extensions Express avant le chargement de server.js.
 * Les routes historiques gardent leur URL afin de ne pas casser le frontend,
 * les favoris ni les éventuels scripts d'administration existants.
 */
export function installExpressIntegration() {
  // Le préchargement Node ne devrait s'exécuter qu'une fois. Ce garde-fou évite
  // néanmoins d'empiler les adaptations lors d'un test ou d'un rechargement.
  if (express.application[EXPRESS_PATCH_FLAG]) return;
  express.application[EXPRESS_PATCH_FLAG] = true;

  /**
   * Installe le pont CSRF comme tout premier middleware de l'application.
   *
   * Il est ajouté avant les middlewares de server.js afin que les contrôles
   * d'authentification historiques reçoivent un en-tête cohérent. Le pont ne
   * s'active que sur Render, ou lorsqu'il est explicitement demandé, et ne
   * traite que les origines figurant dans la liste CORS autorisée.
   */
  const originalUse = express.application.use;
  express.application.use = function patchedUse(...handlers) {
    if (!this[CSRF_BRIDGE_FLAG]) {
      originalUse.call(this, createCrossOriginCsrfBridge());
      this[CSRF_BRIDGE_FLAG] = true;
    }
    return originalUse.apply(this, handlers);
  };

  /**
   * Remplace les contrôleurs POST liés à la création et à la récupération des
   * comptes tout en conservant les protections déjà posées par server.js.
   */
  const originalPost = express.application.post;
  express.application.post = function patchedPost(path, ...handlers) {
    if (path === "/auth/request-access" && handlers.length) {
      return replaceLastHandler(originalPost, this, path, handlers, requestAccessWithAssociations);
    }
    if (path === "/auth/forgot-password" && handlers.length) {
      return replaceLastHandler(originalPost, this, path, handlers, forgotPassword);
    }
    return originalPost.call(this, path, ...handlers);
  };

  /**
   * Sécurise la mise à jour des séances sans modifier le contrat API existant.
   * Un membre standard ne peut toucher qu'à sa propre inscription ; un référent
   * ou encadrant peut en plus changer le type/statut ; l'administration garde la
   * gestion complète de la séance.
   */
  const originalPut = express.application.put;
  express.application.put = function patchedPut(path, ...handlers) {
    if (path === "/sessions/:id" && handlers.length) {
      return replaceLastHandler(originalPut, this, path, handlers, updateSessionWithAuthorization);
    }
    return originalPut.call(this, path, ...handlers);
  };

  /**
   * Remplace les contrôleurs GET sensibles par des services spécialisés.
   * Les middlewares requireAuth/requireAdmin déjà présents dans server.js sont
   * conservés : seul le contrôleur final est substitué.
   */
  const originalGet = express.application.get;
  express.application.get = function patchedGet(path, ...handlers) {
    if (path === "/participants" && handlers.length) {
      return replaceLastHandler(originalGet, this, path, handlers, listParticipantsWithPrivacy);
    }
    if (path === "/realisations" && handlers.length) {
      return replaceLastHandler(originalGet, this, path, handlers, listRealisationsWithPrivacy);
    }
    if (path === "/admin/auth/users" && handlers.length) {
      return replaceLastHandler(originalGet, this, path, handlers, listUsers);
    }
    if (path === "/admin/export-data" && handlers.length) {
      return replaceLastHandler(originalGet, this, path, handlers, exportAllData);
    }
    if (path === "/auth/verify-email" && handlers.length) {
      return replaceLastHandler(originalGet, this, path, handlers, verifyEmailRequest);
    }
    return originalGet.call(this, path, ...handlers);
  };

  /**
   * Termine l'initialisation juste avant l'écoute réseau.
   * Le schéma PostgreSQL complémentaire est créé avant d'accepter des requêtes,
   * ce qui évite qu'un écran d'administration s'ouvre sur des tables absentes.
   */
  const originalListen = express.application.listen;
  express.application.listen = function patchedListen(...args) {
    const app = this;

    const startListening = async () => {
      await ensureAdminUserSchema();

      if (!app[INSTALL_FLAG]) {
        app.post("/admin/auth/users/:id/admin", requireAdmin, updateAdminRight);
        app.post("/admin/auth/associations/auto", requireAdmin, associateExistingAccounts);
        app.put("/admin/auth/users/:id/participant", requireAdmin, setUserParticipantAssociation);
        app.get("/auth/verify-email", verifyEmailRequest);
        app.post("/auth/change-password", requireAuthUser, changePassword);
        app.post("/auth/change-email/request", requireAuthUser, requestEmailChange);
        app.get("/auth/change-email/confirm", confirmEmailChange);
        installBackupRoutes(app);
        app[INSTALL_FLAG] = true;
      }

      const server = originalListen.apply(app, args);
      startBackupScheduler();
      await startAccessLogRetentionScheduler();
      return server;
    };

    startListening().catch((error) => {
      console.error("Erreur d’installation des évolutions utilisateurs :", error);
      process.exitCode = 1;
    });

    // Compatibilité avec le comportement historique : server.js ne réutilise
    // pas la valeur de retour de listen(). Le démarrage réel reste asynchrone.
    return app;
  };
}
