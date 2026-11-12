function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function sendTokenConfirmationPage(req, res, {
  title,
  message,
  postPath,
}) {
  const token = String(req.query?.token || "").trim();
  if (!token) return res.status(400).send("Lien de confirmation invalide.");

  const action = `${postPath}?token=${encodeURIComponent(token)}`;
  res.set(
    "Content-Security-Policy",
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  );
  res.type("html").send(`<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="font-family:system-ui,sans-serif;max-width:42rem;margin:4rem auto;padding:0 1rem;line-height:1.5">
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(message)}</p>
  <form method="post" action="${escapeHtml(action)}">
    <button type="submit">Confirmer</button>
  </form>
</body>
</html>`);
}
