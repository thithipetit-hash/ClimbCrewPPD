import { ensureAdminUserSchema } from "./database.js";
import {
  changePassword,
  confirmEmailChange,
  listUsers,
  requestEmailChange,
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
import {
  associateExistingAccountsByEmail,
  requestAccessByEmailOnly,
} from "./email-association-service.js";
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
import { startAccessLogRetentionScheduler } from "./access-log-retention.js";
import { startSecurityRetentionScheduler } from "./security-retention-service.js";
import {
  requireAdmin as requireEnhancementAdmin,
  requireAuthUser,
} from "./security.js";
import { safeHealthCheck } from "./maintenance-hardening.js";
import { installBackupRoutes } from "../backup-routes.js";
import { startBackupScheduler } from "../backup-service.js";

/**
 * Enregistre explicitement les contrôleurs modernes qui remplaçaient auparavant
 * des handlers historiques via un monkey-patch global d'Express.
 *
 * Les routes qui existaient déjà conservent les middlewares de server.js.
 * Les routes de libre-service ajoutées par les évolutions utilisateurs gardent
 * leur middleware dédié car certains contrôleurs lisent req.enhancementAuth.
 */
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
  app.get("/admin/export-data", requireAuth, requireAdmin, exportAllData);

  // Routes ajoutées par le module utilisateurs : leur middleware dédié remplit
  // req.enhancementAuth et applique aussi CSRF/rôle sans dépendre du serveur legacy.
  app.post("/admin/auth/users/:id/admin", requireEnhancementAdmin, updateAdminRightSafely);
  app.post("/admin/auth/associations/auto", requireEnhancementAdmin, associateExistingAccountsByEmail);
  app.put(
    "/admin/auth/users/:id/participant",
    requireEnhancementAdmin,
    setAccountParticipantAssociation,
  );
  app.post("/auth/change-password", requireAuthUser, changePassword);
  app.post("/auth/change-email/request", requireAuthUser, requestEmailChange);
  app.get("/auth/change-email/confirm", confirmEmailChange);
  app.get("/auth/notification-preference", requireAuthUser, getAccountNotificationPreference);
  app.patch("/auth/notification-preference", requireAuthUser, updateAccountNotificationPreference);
  app.get("/participants/:id/avatar", requireAuthUser, getParticipantCustomAvatar);
  app.get(
    "/admin/auth/notification-preferences",
    requireEnhancementAdmin,
    listManagedAccountNotificationPreferences,
  );
  app.put(
    "/admin/participants/:participantId/account-notifications",
    requireEnhancementAdmin,
    updateManagedAccountNotificationPreference,
  );

  installBackupRoutes(app);
}

export async function initializeAdminUserEnhancements() {
  await ensureAdminUserSchema();
}

export async function startAdminUserSchedulers() {
  startBackupScheduler();
  await startAccessLogRetentionScheduler();
  await startSecurityRetentionScheduler();
}
