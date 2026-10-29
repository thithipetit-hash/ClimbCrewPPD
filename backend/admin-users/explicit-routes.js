import {
  changePassword,
  confirmEmailChange,
  listUsers,
  requestEmailChange,
  resendAccountConfirmationEmail,
} from "./account-service.js";
import {
  reactivateAccountSafely,
  revokeAccountSafely,
  updateAdminRightSafely,
} from "./account-lifecycle-service.js";
import {
  secureAdminResetToken,
  secureForgotPassword,
  secureLogin,
  secureResetPassword,
} from "./auth-hardening-service.js";
import { verifyEmailPendingAdminApproval } from "./account-approval-flow-service.js";
import { setAccountParticipantAssociation } from "./account-participant-association-service.js";
import {
  approveVerifiedAccountWithParticipantRole,
  updateParticipantWithAdminRight,
} from "./participant-admin-right-service.js";
import { deleteParticipantSafely } from "./participant-lifecycle-service.js";
import {
  getAccountNotificationPreference,
  listManagedAccountNotificationPreferences,
  updateAccountNotificationPreference,
  updateManagedAccountNotificationPreference,
} from "./account-notification-preference-service.js";
import { requestAccessByEmailOnly } from "./email-association-service.js";
import { importBusinessDataSafely } from "./secure-import-service.js";
import { exportAllData } from "./export-service.js";
import {
  listParticipantsWithPrivacy,
  listRealisationsWithPrivacy,
} from "./participant-privacy-service.js";
import {
  getParticipantCustomAvatar,
  updateOwnParticipantProfile,
} from "./participant-avatar-service.js";
import {
  addSessionParticipantWithAuthorization,
  removeSessionParticipantWithAuthorization,
  updateSessionWithAuthorization,
} from "./session-authorization-service.js";
import { updateParticipantInitiatorQualifications } from "./initiator-qualification-service.js";
import { startAccessLogRetentionScheduler } from "./access-log-retention.js";
import { startSecurityRetentionScheduler } from "./security-retention-service.js";
import { safeHealthCheck } from "./maintenance-hardening.js";
import { installBackupRoutes } from "../backup-routes.js";
import { createBackup, startBackupScheduler } from "../backup-service.js";
import { installVideoAnalysisSettingsRoutes } from "../video-analysis-settings-routes.js";
import { getPool } from "./database.js";
import { recalculateOwnStatisticsAndCpr, resetOwnCpr } from "./participant-cpr-reset-service.js";
import { sendTokenConfirmationPage } from "../token-confirmation-page.js";

function showVerifyEmailConfirmation(req, res) {
  return sendTokenConfirmationPage(req, res, {
    title: "Confirmer l’adresse e-mail",
    message: "Confirmez explicitement la validation de cette adresse e-mail.",
    postPath: "/api/auth/verify-email",
  });
}

function showEmailChangeConfirmation(req, res) {
  return sendTokenConfirmationPage(req, res, {
    title: "Confirmer le changement d’adresse e-mail",
    message: "Confirmez explicitement le changement vers la nouvelle adresse.",
    postPath: "/api/auth/change-email/confirm",
  });
}

async function resetAdminData(req, res) {
  const type = String(req.params.type || "");
  const pool = getPool();
  const destructiveTypes = new Set(["realisations", "cotisations", "ffme"]);

  if (type === "statistiques") {
    return res.json({ ok: true, type, recalculated: true, affected: 0 });
  }
  if (!destructiveTypes.has(type)) {
    return res.status(400).json({ error: "Type de réinitialisation inconnu" });
  }

  const expectedConfirmation = `RESET_${type.toUpperCase()}`;
  if (String(req.body?.confirm || "") !== expectedConfirmation) {
    return res.status(400).json({ error: `Confirmation ${expectedConfirmation} requise` });
  }

  let safetyBackup;
  try {
    safetyBackup = await createBackup({ reason: `pre-reset-${type}` });
  } catch (error) {
    console.error(`Sauvegarde de sécurité avant reset ${type} impossible :`, error);
    return res.status(503).json({
      error: "Réinitialisation refusée : la sauvegarde de sécurité PostgreSQL n’a pas pu être créée.",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    let result;
    if (type === "realisations") {
      result = await client.query("delete from realisations");
    } else if (type === "cotisations") {
      result = await client.query(
        "update participants set cotisation = false where cotisation is distinct from false",
      );
    } else {
      result = await client.query(
        "update participants set ffme = false where ffme is distinct from false",
      );
    }
    await client.query("commit");
    return res.json({
      ok: true,
      type,
      affected: result.rowCount,
      safetyBackup: safetyBackup.fileName,
    });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    console.error(`Reset ${type} impossible :`, error);
    return res.status(500).json({ error: "Réinitialisation impossible" });
  } finally {
    client.release();
  }
}

export function installExplicitAdminUserRoutes(app, {
  requireAuth,
  requireAdmin,
  authRateLimit,
  resetRateLimit,
}) {
  app.get("/health", safeHealthCheck);
  app.post("/auth/login", authRateLimit, secureLogin);
  app.post("/auth/request-access", authRateLimit, requestAccessByEmailOnly);
  app.post("/auth/forgot-password", resetRateLimit, secureForgotPassword);
  app.post("/auth/reset-password", resetRateLimit, secureResetPassword);
  app.get("/auth/verify-email", showVerifyEmailConfirmation);
  app.post("/auth/verify-email", verifyEmailPendingAdminApproval);
  app.get("/admin/auth/users", requireAuth, requireAdmin, listUsers);
  app.post("/admin/auth/users/:id/resend-confirmation", requireAuth, requireAdmin, resetRateLimit, resendAccountConfirmationEmail);
  app.post("/admin/auth/users/:id/approve", requireAuth, requireAdmin, approveVerifiedAccountWithParticipantRole);
  app.post("/admin/auth/users/:id/revoke", requireAuth, requireAdmin, revokeAccountSafely);
  app.post("/admin/auth/users/:id/reactivate", requireAuth, requireAdmin, reactivateAccountSafely);
  app.post("/admin/auth/users/:id/reset-token", requireAuth, requireAdmin, secureAdminResetToken);
  app.get("/participants", requireAuth, listParticipantsWithPrivacy);
  app.put("/participants/:id", requireAuth, requireAdmin, updateParticipantWithAdminRight);
  app.patch("/participants/me/profile", requireAuth, updateOwnParticipantProfile);
  app.post("/participants/me/cpr/reset", requireAuth, resetOwnCpr);
  app.post("/participants/me/statistics/recalculate", requireAuth, recalculateOwnStatisticsAndCpr);
  app.delete("/participants/:id", requireAuth, requireAdmin, deleteParticipantSafely);
  app.get("/realisations", requireAuth, listRealisationsWithPrivacy);
  app.put("/sessions/:id", requireAuth, updateSessionWithAuthorization);
  app.post("/sessions/:id/participants/:participantId", requireAuth, addSessionParticipantWithAuthorization);
  app.delete("/sessions/:id/participants/:participantId", requireAuth, removeSessionParticipantWithAuthorization);
  app.post("/admin/import-data", requireAuth, requireAdmin, importBusinessDataSafely);
  app.post("/admin/reset/:type", requireAuth, requireAdmin, resetAdminData);
  app.get("/admin/export-data", requireAuth, requireAdmin, exportAllData);
  app.post("/admin/auth/users/:id/admin", requireAuth, requireAdmin, updateAdminRightSafely);
  app.put("/admin/auth/users/:id/participant", requireAuth, requireAdmin, setAccountParticipantAssociation);
  app.post("/auth/change-password", requireAuth, changePassword);
  app.post("/auth/change-email/request", requireAuth, requestEmailChange);
  app.get("/auth/change-email/confirm", showEmailChangeConfirmation);
  app.post("/auth/change-email/confirm", confirmEmailChange);
  app.get("/auth/notification-preference", requireAuth, getAccountNotificationPreference);
  app.patch("/auth/notification-preference", requireAuth, updateAccountNotificationPreference);
  app.get("/participants/:id/avatar", requireAuth, getParticipantCustomAvatar);
  app.get("/admin/auth/notification-preferences", requireAuth, requireAdmin, listManagedAccountNotificationPreferences);
  app.put("/admin/participants/:participantId/account-notifications", requireAuth, requireAdmin, updateManagedAccountNotificationPreference);
  app.put("/admin/participants/:id/qualifications", requireAuth, requireAdmin, updateParticipantInitiatorQualifications);
  installVideoAnalysisSettingsRoutes(app, { requireAuth, requireAdmin });
  installBackupRoutes(app, { requireAuth, requireAdmin });
}

// Le schéma est désormais intégralement géré par backend/database/migrate.js.
// Cette étape est conservée temporairement dans le contrat de bootstrap afin de
// ne pas modifier davantage le démarrage dans cette évolution.
export async function initializeAdminUserEnhancements() {}

export async function startAdminUserSchedulers() {
  startBackupScheduler();
  await startAccessLogRetentionScheduler();
  await startSecurityRetentionScheduler();
}
