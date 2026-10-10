function isArchiveOnlyPayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const keys = Object.keys(body);
  return keys.length === 1 && keys[0] === "active" && body.active === false;
}

async function archiveActiveRoutes({ pool, logAccess, req }) {
  const archivedResult = await pool.query(`
    update routes
    set active = false, updated_at = now()
    where active is distinct from false
    returning id
  `);
  const archivedCount = archivedResult.rowCount;

  if (archivedCount > 0) {
    await logAccess({
      userId: req.auth.user.id,
      eventType: "routes_archived",
      success: true,
      req,
      details: { archivedCount },
    });
  }

  return archivedCount;
}

export function installAdminRouteArchiveRoute(app, { requireAuth, requireAdmin, pool, logAccess }) {
  app.get("/routes", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  app.post("/admin/routes/archive-active", requireAuth, requireAdmin, async (req, res) => {
    try {
      const archivedCount = await archiveActiveRoutes({ pool, logAccess, req });
      res.json({ ok: true, archivedCount });
    } catch (error) {
      console.error("Archivage des voies impossible :", error);
      res.status(500).json({ error: error.message || "Archivage des voies impossible" });
    }
  });

  app.put("/routes/:id", requireAuth, requireAdmin, async (req, res, next) => {
    if (!isArchiveOnlyPayload(req.body)) return next();

    try {
      await archiveActiveRoutes({ pool, logAccess, req });
      return next();
    } catch (error) {
      console.error("Archivage groupé des voies impossible :", error);
      return res.status(500).json({ error: error.message || "Archivage des voies impossible" });
    }
  });
}
