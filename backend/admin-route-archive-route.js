export function installAdminRouteArchiveRoute(app, { requireAuth, requireAdmin, pool, logAccess }) {
  app.post("/admin/routes/archive-active", requireAuth, requireAdmin, async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const archivedResult = await client.query(`
        update routes
        set active = false, updated_at = now()
        where active is distinct from false
        returning id
      `);
      const archivedCount = archivedResult.rowCount;

      const remainingResult = await client.query(
        "select count(*)::integer as count from routes where active is distinct from false",
      );
      const remainingActiveCount = Number(remainingResult.rows[0]?.count || 0);
      if (remainingActiveCount !== 0) {
        throw new Error(`${remainingActiveCount} voie(s) restent actives après archivage`);
      }

      await client.query("commit");
      await logAccess({
        userId: req.auth.user.id,
        eventType: "routes_archived",
        success: true,
        req,
        details: { archivedCount, remainingActiveCount },
      });

      res.json({ ok: true, archivedCount, remainingActiveCount });
    } catch (error) {
      await client.query("rollback");
      console.error("Archivage des voies impossible :", error);
      res.status(500).json({ error: error.message || "Archivage des voies impossible" });
    } finally {
      client.release();
    }
  });
}
