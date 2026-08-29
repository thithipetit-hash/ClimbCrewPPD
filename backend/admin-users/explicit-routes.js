import { ensureAdminUserSchema } from "./database.js";
import { runDatabaseMigrations } from "./migration-service.js";
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
  app.post("/admin/auth/users/:id/admin", requireAuth, requireAdmin, updateAdminRightSafely);
  app.post("/admin/auth/associations/auto", requireAuth, requireAdmin, associateExistingAccountsByEmail);
  app.put("/admin/auth/users/:id/participant", requireAuth, requireAdmin, setAccountParticipantAssociation);
  app.post("/auth/change-password", requireAuth, changePassword);
  app.post("/auth/change-email/request", requireAuth, requestEmailChange);
  app.get("/auth/change-email/confirm", confirmEmailChange);
  app.get("/auth/notification-preference", requireAuth, getAccountNotificationPreference);
  app.patch("/auth/notification-preference", requireAuth, updateAccountNotificationPreference);
  app.get("/participants/:id/avatar", requireAuth, getParticipantCustomAvatar);
  app.get("/admin/auth/notification-preferences", requireAuth, requireAdmin, listManagedAccountNotificationPreferences);
  app.put("/admin/participants/:participantId/account-notifications", requireAuth, requireAdmin, updateManagedAccountNotificationPreference);
  installBackupRoutes(app);
}

export async function initializeAdminUserEnhancements() {
  await runDatabaseMigrations();
  await ensureAdminUserSchema();
}

export async function startAdminUserSchedulers() {
  startBackupScheduler();
  await startAccessLogRetentionScheduler();
  await startSecurityRetentionScheduler();
}
