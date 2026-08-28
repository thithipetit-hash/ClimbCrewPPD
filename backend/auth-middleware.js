export function createAuthMiddleware({
  pool,
  hashToken,
  getRequestToken,
  isSafeMethod,
  getCookie,
  csrfCookieName,
  constantTimeEqual,
  serializeUser,
}) {
  async function loadSessionFromToken(rawToken) {
    const tokenHash = hashToken(rawToken);
    const result = await pool.query(
      `
        select
          us.id as session_id,
          us.user_id,
          us.expires_at,
          us.revoked_at,
          u.id,
          u.participant_id,
          u.email,
          u.prenom,
          u.nom,
          u.role,
          u.status,
          u.created_at,
          u.approved_at,
          u.revoked_at as user_revoked_at,
          u.revoked_reason,
          u.last_login_at,
          u.must_reset_password,
          u.theme_preference
        from user_sessions us
        join users u on u.id = us.user_id
        where us.token_hash = $1
          and us.revoked_at is null
          and us.expires_at > now()
        limit 1
      `,
      [tokenHash]
    );
    return result.rows[0] || null;
  }

  async function requireAuth(req, res, next) {
    const rawToken = getRequestToken(req);
    if (!rawToken) return res.status(401).json({ error: "Authentification requise" });

    const session = await loadSessionFromToken(rawToken);
    if (!session || session.status !== "active") {
      return res.status(401).json({ error: "Session invalide ou compte non actif" });
    }

    if (!isSafeMethod(req.method)) {
      const csrfHeader = req.headers["x-csrf-token"];
      const csrfCookie = getCookie(req, csrfCookieName);
      if (!csrfHeader || !csrfCookie || !constantTimeEqual(csrfHeader, csrfCookie)) {
        return res.status(403).json({ error: "Protection CSRF : jeton absent ou invalide" });
      }
    }

    req.auth = {
      token: rawToken,
      sessionId: session.session_id,
      user: serializeUser(session),
    };
    next();
  }

  function requireAdmin(req, res, next) {
    if (req.auth?.user?.role !== "admin") {
      return res.status(403).json({ error: "Accès administrateur requis" });
    }

    // Toute action d'écriture autorisée à un administrateur est auditée après
    // l'envoi de la réponse. Le corps de la requête n'est volontairement jamais
    // journalisé afin d'exclure mots de passe, jetons et autres données sensibles.
    if (!isSafeMethod(req.method) && !req.adminAuditAttached) {
      req.adminAuditAttached = true;
      const startedAt = Date.now();
      res.once("finish", () => {
        const user = req.auth?.user;
        const path = String(req.path || req.url || "").split("?")[0];
        const forwarded = req.headers["x-forwarded-for"];
        const ipAddress = typeof forwarded === "string" && forwarded.length > 0
          ? forwarded.split(",")[0].trim()
          : req.ip || null;
        const details = {
          actor_email: user?.email || null,
          actor_role: user?.role || "admin",
          method: String(req.method || "").toUpperCase(),
          path,
          status_code: res.statusCode,
          request_id: req.requestId || null,
          duration_ms: Date.now() - startedAt,
        };

        pool.query(
          `
            insert into access_logs (user_id, event_type, success, ip_address, user_agent, details)
            values ($1, 'admin_action', $2, $3, $4, $5::jsonb)
          `,
          [
            user?.id || null,
            res.statusCode < 400,
            ipAddress,
            req.headers["user-agent"] || null,
            JSON.stringify(details),
          ]
        ).catch((error) => {
          console.error("Journalisation admin_action impossible :", error);
        });
      });
    }

    next();
  }

  return { requireAuth, requireAdmin };
}
