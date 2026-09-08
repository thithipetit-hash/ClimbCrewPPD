/**
 * Vérifie que chaque valeur de cookie peut être décodée par les anciens parseurs
 * de server.js. Une valeur percent-encodée invalide ne doit jamais provoquer une
 * exception avant l'authentification.
 *
 * Si un seul cookie est malformé, l'en-tête complet est retiré : la requête sera
 * simplement considérée comme non authentifiée. Aucun cookie fourni par le
 * client n'est réécrit ou interprété partiellement.
 */
export function sanitizeMalformedCookieHeader(req, _res, next) {
  const header = String(req?.headers?.cookie || "");
  if (!header) return next();

  try {
    for (const part of header.split(";")) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const separator = trimmed.indexOf("=");
      if (separator < 0) continue;
      decodeURIComponent(trimmed.slice(separator + 1));
    }
  } catch {
    delete req.headers.cookie;
  }

  return next();
}
