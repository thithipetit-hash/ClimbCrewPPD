import { getDatabaseMigrationStatus } from "./database/migrate.js";

export function installDatabaseMaintenanceRoutes(app, {
  requireSetupAccess,
  runMigrations,
  ensureDefaultAdmin,
  pool,
  firstAdminEmail,
}) {
  app.get("/setup-db", requireSetupAccess, async (_req, res) => {
    try {
      const migrations = await runMigrations();
      await ensureDefaultAdmin();
      res.json({
        ok: true,
        message: "Migrations appliquées. Si aucun admin n'existait, le compte FIRST_ADMIN_EMAIL a été créé uniquement si les variables FIRST_ADMIN_EMAIL et FIRST_ADMIN_PASSWORD sont configurées.",
        migrations,
        firstAdminEmailConfigured: Boolean(firstAdminEmail),
      });
    } catch (error) {
      res.status(500).json({ ok: false, error: String(error) });
    }
  });

  app.get("/db-status", requireSetupAccess, async (_req, res) => {
    try {
      const result = await pool.query(`
        select
          current_database() as database,
          to_regclass('public.participants') as participants,
          to_regclass('public.sessions') as sessions,
          to_regclass('public.session_participants') as session_participants,
          to_regclass('public.users') as users,
          to_regclass('public.user_sessions') as user_sessions,
          to_regclass('public.password_reset_tokens') as password_reset_tokens,
          to_regclass('public.access_logs') as access_logs,
          to_regclass('public.ropes') as ropes,
          to_regclass('public.routes') as routes,
          to_regclass('public.realisations') as realisations,
          to_regclass('public.schema_migrations') as schema_migrations
      `);
      const migrations = await getDatabaseMigrationStatus(pool);

      res.json({ ok: true, ...result.rows[0], migrations });
    } catch (error) {
      res.status(500).json({ ok: false, error: String(error) });
    }
  });
}
