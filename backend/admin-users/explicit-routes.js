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
import { safeHealthCheck } from "./maintenance-hardening.js";
import { installBackupRoutes } from "../backup-routes.js";
import { startBackupScheduler } from "../backup-service.js";

/**
 * Enregistre explicitement les contrôleurs modernes qui remplaçaient auparavant
 * des handlers historiques via un monkey-patch global d'Express.
 *
 * Les middlewares d'authentification/rate-limit sont fournis par server.js afin
 * de conserver exactement la même politique de sécurité sur les URL existantes.
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
  app.post("/admin/auth/users/:id/admin", requireAdmin, updateAdminRightSafely);
  app.post("/admin/auth/associations/auto", requireAdmin, associateExistingAccountsByEmail);
  app.put("/admin/auth/users/:id/participant", requireAdmin, setAccountParticipantAssociation);

  app.get("/participants", requireAuth, listParticipantsWithPrivacy);
  app.put("/participants/:id", requireAuth, requireAdmin, updateParticipantWithAdminRight);
  app.patch("/participants/me/profile", requireAuth, updateOwnParticipantProfile);
  app.delete("/participants/:id", requireAuth, requireAdmin, deleteParticipantSafely);
  app.get("/participants/:id/avatar", requireAuth, getParticipantCustomAvatar);

  app.get("/realisations", requireAuth, listRealisationsWithPrivacy);
  app.put("/sessions/:id", requireAuth, updateSessionWithAuthorization);

  app.post("/admin/import-data", requireAuth, requireAdmin, importBusinessDataSafely);
  app.get("/admin/export-data", requireAuth, requireAdmin, exportAllData);

  // Routes de compte ajoutées après le serveur historique.
  app.post("/auth/change-password", requireAuth, changePassword);
  app.post("/auth/change-email/request", requireAuth, requestEmailChange);
  app.get("/auth/change-email/confirm", confirmEmailChange);
  app.get("/auth/notification-preference", requireAuth, getAccountNotificationPreference);
  app.patch("/auth/notification-preference", requireAuth, updateAccountNotificationPreference);
  app.get(
    "/admin/auth/notification-preferences",
    requireAuth,
    requireAdmin,
    listManagedAccountNotificationPreferences,
  );
  app.put(
    "/admin/participants/:participantId/account-notifications",
    requireAuth,
    requireAdmin,
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
