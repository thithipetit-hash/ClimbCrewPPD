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
import { updateSessionWithAuthorization } from "./session-authorization-service.js";
import { updateParticipantInitiatorQualifications } from "./initiator-qualification-service.js";
import { startAccessLogRetentionScheduler } from "./access-log-retention.js";
import { startSecurityRetentionScheduler } from "./security-retention-service.js";
import { safeHealthCheck } from "./maintenance-hardening.js";
import { installBackupRoutes } from "../backup-routes.js";
import { startBackupScheduler } from "../backup-service.js";
import { installVideoAnalysisSettingsRoutes } from "../video-analysis-settings-routes.js";
import { getPool } from "./database.js";

async function resetAdminData(req, res) {
  const type = String(req.params.type || "");
  const pool = getPool();
  if (type === "realisations") {
    const result = await pool.query("delete from realisations");
    return res.json({ ok: true, type, affected: result.rowCount });
  }
  if (type === "statistiques") {
    // Les statistiques ClimbCrew sont dérivées à la volée des données métier
    // (réalisations, séances, participants et voies). Il n’existe donc aucune
    // donnée statistique persistée à supprimer : demander leur reset force le
    // client à recharger les sources et à recalculer tous les agrégats.
    return res.json({ ok: true, type, recalculated: true, affected: 0 });
  }
  if (type === "cotisations") {
    const result = await pool.query("update participants set cotisation = false where cotisation is distinct from false");
    return res.json({ ok: true, type, affected: result.rowCount });
  }
  if (type === "ffme") {
    const result = await pool.query("update participants set ffme = false where ffme is distinct from false");
    return res.json({ ok: true, type, affected: result.rowCount });
  }
  return res.status(400).json({ error: "Type de réinitialisation inconnu" });
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
  app.get("/auth/verify-email", verifyEmailPendingAdminApproval);
  app.get("/admin/auth/users", requireAuth, requireAdmin, listUsers);
  app.post("/admin/auth/users/:id/resend-confirmation", requireAuth, requireAdmin, resetRateLimit, resendAccountConfirmationEmail);
  app.post("/admin/auth/users/:id/approve", requireAuth, requireAdmin, approveVerifiedAccountWithParticipantRole);
  app.post("/admin/auth/users/:id/revoke", requireAuth, requireAdmin, revokeAccountSafely);
  app.post("/admin/auth/users/:id/reactivate", requireAuth, requireAdmin, reactivateAccountSafely);
  app.post("/admin/auth/users/:id/reset-token", requireAuth, requireAdmin, secureAdminResetToken);
  app.get("/participants", requireAuth, listParticipantsWithPrivacy);
  app.put("/participants/:id", requireAuth, requireAdmin, updateParticipantWithAdminRight);
  app.patch("/participants/me/profile", requireAuth, updateOwnParticipantProfile);
  app.delete("/participants/:id", requireAuth, requireAdmin, deleteParticipantSafely);
  app.get("/realisations", requireAuth, listRealisationsWithPrivacy);
  app.put("/sessions/:id", requireAuth, updateSessionWithAuthorization);
  app.post("/admin/import-data", requireAuth, requireAdmin, importBusinessDataSafely);
  app.post("/admin/reset/:type", requireAuth, requireAdmin, resetAdminData);
  app.get("/admin/export-data", requireAuth, requireAdmin, exportAllData);
  app.post("/admin/auth/users/:id/admin", requireAuth, requireAdmin, updateAdminRightSafely);
  app.put("/admin/auth/users/:id/participant", requireAuth, requireAdmin, setAccountParticipantAssociation);
  app.post("/auth/change-password", requireAuth, changePassword);
  app.post("/auth/change-email/request", requireAuth, requestEmailChange);
  app.get("/auth/change-email/confirm", confirmEmailChange);
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
