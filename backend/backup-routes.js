import express from "express";
import {
  createManualBackupAndEmail,
  getBackupConfig,
  importBackupBuffer,
  listBackups,
  restoreBackup,
  sendBackupByEmail,
} from "./backup-service.js";

function restartProcessSoon(exitCode = 0) {
  setTimeout(() => process.exit(exitCode), 1200).unref?.();
}

function emailRuntimeConfig() {
  const enabled = ["1", "true", "yes", "oui", "on"].includes(
    String(process.env.EMAIL_ENABLED || "").trim().toLowerCase(),
  );
  const fromAddress = String(
    process.env.EMAIL_FROM_ADDRESS || process.env.SMTP_USER || "",
  ).trim().toLowerCase();

  return {
    emailEnabled: enabled,
    emailFromAddress: fromAddress,
  };
}

/**
 * Routes d'exploitation réservées aux administrateurs authentifiés.
 * Les middlewares canoniques requireAuth puis requireAdmin sont injectés par
 * server.js via explicit-routes.js afin qu'il n'existe plus de second chemin
 * d'authentification. Les dumps restent dans /backups et ne sont jamais exposés
 * comme fichiers statiques.
 */
export function installBackupRoutes(app, { requireAuth, requireAdmin }) {
  app.get("/admin/backups", requireAuth, requireAdmin, async (_req, res) => {
    try {
      const backups = await listBackups();
      res.json({
        ok: true,
        backups,
        config: {
          ...getBackupConfig(),
          ...emailRuntimeConfig(),
        },
      });
    } catch (error) {
      console.error("GET /admin/backups", error);
      res.status(500).json({ error: "Chargement des sauvegardes impossible" });
    }
  });

  app.post("/admin/backups", requireAuth, requireAdmin, async (_req, res) => {
    try {
      const backup = await createManualBackupAndEmail();
      res.status(201).json({ ok: true, backup });
    } catch (error) {
      console.error("POST /admin/backups", error);
      res.status(500).json({ error: "Création de la sauvegarde impossible" });
    }
  });

  app.post("/admin/backups/:filename/email", requireAuth, requireAdmin, async (req, res) => {
    try {
      const result = await sendBackupByEmail(req.params.filename);
      res.json({ ok: true, sent: Boolean(result.sent), skipped: Boolean(result.skipped) });
    } catch (error) {
      console.error("POST /admin/backups/:filename/email", error);
      res.status(500).json({ error: "Envoi de la sauvegarde impossible" });
    }
  });

  app.post(
    "/admin/backups/import",
    requireAuth,
    requireAdmin,
    express.raw({ type: "application/octet-stream", limit: "50mb" }),
    async (req, res) => {
      try {
        const sourceName = String(req.query.filename || "").trim();
        const imported = await importBackupBuffer(req.body, sourceName);
        res.status(201).json({ ok: true, backup: imported });
      } catch (error) {
        console.error("POST /admin/backups/import", error);
        res.status(400).json({ error: error.message || "Import de la sauvegarde impossible" });
      }
    },
  );

  app.post("/admin/backups/:filename/restore", requireAuth, requireAdmin, async (req, res) => {
    if (String(req.body?.confirm || "") !== "RESTAURER") {
      return res.status(400).json({ error: "Confirmation RESTAURER requise" });
    }

    try {
      const result = await restoreBackup(req.params.filename);
      res.json({
        ok: true,
        ...result,
        message: "Sauvegarde restaurée. Toutes les sessions ont été révoquées et l'API redémarre.",
      });
      restartProcessSoon(0);
    } catch (error) {
      console.error("POST /admin/backups/:filename/restore", error);
      res.status(500).json({ error: error.message || "Restauration impossible" });
      if (error.restartRequired) restartProcessSoon(1);
    }
  });
}
