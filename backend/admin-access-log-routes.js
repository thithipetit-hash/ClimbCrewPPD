import { getRuntimeDiagnosticLogs } from "./runtime-diagnostic-log-service.js";

function sortLogsByNewest(logs) {
  return [...logs].sort((left, right) => {
    return new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime();
  });
}

export function installAdminAccessLogRoutes(app, { requireAuth, requireAdmin, pool }) {
  app.get("/admin/auth/logs", requireAuth, requireAdmin, async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit || 200), 1), 500);
    const runtimeLogs = getRuntimeDiagnosticLogs(limit);

    try {
      const result = await pool.query(
        `
          select
            al.id,
            al.event_type,
            al.success,
            al.ip_address,
            al.user_agent,
            al.created_at,
            al.details,
            coalesce(u.email, al.details->>'email') as email,
            coalesce(al.details::text, '') as details_text
          from access_logs al
          left join users u on u.id = al.user_id
          order by al.created_at desc
          limit $1
        `,
        [limit]
      );

      const logs = sortLogsByNewest([...runtimeLogs, ...result.rows]).slice(0, limit);
      return res.json({ ok: true, logs });
    } catch (error) {
      console.error("Chargement des logs persistants impossible :", error);
      return res.json({
        ok: true,
        logs: runtimeLogs,
        warning: "Les logs persistants sont momentanément indisponibles. Les diagnostics récents du processus restent affichés.",
      });
    }
  });
}
