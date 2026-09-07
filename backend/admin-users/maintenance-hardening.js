import { getPool } from "./database.js";

/**
 * Refuse les jetons de maintenance placés dans l'URL.
 *
 * Un jeton dans une query string peut être copié dans l'historique du navigateur,
 * les journaux du reverse proxy ou un outil de supervision. La seule méthode
 * acceptée devient donc l'en-tête HTTP X-Setup-Token.
 */
export function rejectMaintenanceTokenInQuery(req, res, next) {
  const hasQueryToken = Boolean(
    String(req.query?.setupToken || "").trim()
    || String(req.query?.token || "").trim()
  );

  if (hasQueryToken) {
    return res.status(400).json({
      ok: false,
      error: "Jeton de maintenance refusé dans l'URL. Utilise uniquement l'en-tête X-Setup-Token.",
    });
  }

  next();
}

/**
 * Endpoint de santé public : il indique uniquement si l'API et PostgreSQL
 * répondent. Le détail technique reste dans les journaux serveur.
 */
export async function safeHealthCheck(_req, res) {
  try {
    await getPool().query("select 1");
    return res.json({ ok: true });
  } catch (error) {
    console.error("Health check PostgreSQL en échec :", error);
    return res.status(503).json({ ok: false, error: "Service temporairement indisponible" });
  }
}
