const ALLOWED_THEMES = new Set([
  "auto",
  "light",
  "dark",
  "fun",
  "craie_ardoise",
  "ocean_mineral",
  "foret_mousse",
  "terre_cuite",
  "aurore_alpine",
  "lavande_nocturne",
  "sable_corde",
  "bloc_neon",
  "glacier",
  "cristal",
  "daltonien",
]);

export function installAuthSessionRoutes(app, {
  requireAuth,
  pool,
  randomToken,
  nowPlus,
  sessionDurationMs,
  setCsrfCookie,
  serializeUser,
  logAccess,
  clearSessionCookie,
}) {
  app.get("/auth/me", requireAuth, async (req, res) => {
    res.json({ ok: true, user: req.auth.user });
  });

  app.get("/auth/csrf", requireAuth, async (_req, res) => {
    const csrfToken = randomToken(24);
    const expiresAt = nowPlus(sessionDurationMs);
    setCsrfCookie(res, csrfToken, expiresAt);
    res.json({ ok: true });
  });

  app.put("/auth/theme", requireAuth, async (req, res) => {
    const nextTheme = String(req.body?.theme_preference || "auto").trim().toLowerCase();

    if (!ALLOWED_THEMES.has(nextTheme)) {
      return res.status(400).json({ error: "Préférence de thème invalide" });
    }

    try {
      const result = await pool.query(
        `
          update users
          set theme_preference = $2
          where id = $1
          returning *
        `,
        [req.auth.user.id, nextTheme]
      );

      const user = serializeUser(result.rows[0]);
      res.json({ ok: true, user });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message || String(error), fields: error.fields || undefined });
    }
  });

  app.post("/auth/logout", requireAuth, async (req, res) => {
    try {
      await pool.query(`update user_sessions set revoked_at = now() where id = $1`, [req.auth.sessionId]);

      await logAccess({
        userId: req.auth.user.id,
        eventType: "logout",
        success: true,
        req,
        details: { email: req.auth.user.email },
      });

      clearSessionCookie(res);
      res.json({ ok: true });
    } catch (error) {
      clearSessionCookie(res);
      res.status(500).json({ error: "Erreur lors de la déconnexion" });
    }
  });
}
