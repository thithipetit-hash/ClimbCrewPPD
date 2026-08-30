import bcrypt from "bcryptjs";
import { runDatabaseMigrations } from "../database/migrate.js";

async function cleanupExpiredSecurityData(pool) {
  await pool.query("update user_sessions set revoked_at = now() where revoked_at is null and expires_at <= now()");
  await pool.query("update password_reset_tokens set used_at = now() where used_at is null and expires_at <= now()");
}

export function createDefaultAdminInitializer({ pool, config, cleanEmail, isStrongPassword }) {
  return async function ensureDefaultAdmin() {
    const activeAdmins = await pool.query("select id from users where role = 'admin' and status = 'active' limit 1");
    if (activeAdmins.rowCount > 0) return;

    const email = cleanEmail(config.firstAdminEmail);
    if (!email || !config.firstAdminPassword) {
      console.warn("Aucun administrateur actif et FIRST_ADMIN_EMAIL / FIRST_ADMIN_PASSWORD non configurés. Aucun compte admin par défaut n'a été créé.");
      return;
    }

    if (!config.allowWeakFirstAdminPassword && !isStrongPassword(config.firstAdminPassword)) {
      throw new Error("FIRST_ADMIN_PASSWORD doit respecter la règle de mot de passe fort.");
    }

    const passwordHash = await bcrypt.hash(config.firstAdminPassword, config.bcryptRounds);
    await pool.query(
      `
        insert into users (email, prenom, nom, password_hash, role, status, approved_at, must_reset_password)
        values ($1, $2, $3, $4, 'admin', 'active', now(), false)
        on conflict (email) do update set
          password_hash = excluded.password_hash,
          role = 'admin',
          status = 'active',
          approved_at = coalesce(users.approved_at, now()),
          must_reset_password = false
      `,
      [email, "ClimbCrew", "Admin", passwordHash]
    );

    console.log(`Compte administrateur initial créé : ${email}. Change le mot de passe à la première utilisation.`);
  };
}

export async function startApplication({
  app,
  pool,
  port,
  initializeAdminUserEnhancements,
  ensureDefaultAdmin,
  startAdminUserSchedulers,
}) {
  await runDatabaseMigrations(pool);
  await initializeAdminUserEnhancements();
  await ensureDefaultAdmin();
  await cleanupExpiredSecurityData(pool);

  app.listen(port, () => {
    console.log(`ClimbCrew API listening on port ${port}`);
  });

  startAdminUserSchedulers().catch((error) => {
    console.error("Erreur de démarrage des services utilisateurs :", error);
    process.exitCode = 1;
  });
}
