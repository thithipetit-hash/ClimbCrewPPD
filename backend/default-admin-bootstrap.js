export function createDefaultAdminBootstrap({
  pool,
  cleanEmail,
  firstAdminEmail,
  firstAdminPassword,
  allowWeakFirstAdminPassword,
  isStrongPassword,
  bcrypt,
  bcryptRounds,
}) {
  return async function ensureDefaultAdmin() {
    const activeAdmins = await pool.query(`select id from users where role = 'admin' and status = 'active' limit 1`);
    if (activeAdmins.rowCount > 0) return;

    const email = cleanEmail(firstAdminEmail);
    if (!email || !firstAdminPassword) {
      console.warn("Aucun administrateur actif et FIRST_ADMIN_EMAIL / FIRST_ADMIN_PASSWORD non configurés. Aucun compte admin par défaut n'a été créé.");
      return;
    }

    if (!allowWeakFirstAdminPassword && !isStrongPassword(firstAdminPassword)) {
      throw new Error("FIRST_ADMIN_PASSWORD doit respecter la règle de mot de passe fort.");
    }

    const passwordHash = await bcrypt.hash(firstAdminPassword, bcryptRounds);

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
