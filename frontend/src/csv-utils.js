/** Construit un CSV UTF-8 compatible avec Excel en français. */
export function buildCsv(headers, rows) {
  const escapeCell = (value) => {
    let text = String(value ?? "");
    // Empêche qu'un contenu saisi soit interprété comme une formule par le tableur.
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };

  return `\uFEFF${[headers, ...rows].map((row) => row.map(escapeCell).join(";")).join("\r\n")}`;
}

/** Produit une partie de nom de fichier lisible et sans caractères incompatibles. */
export function csvFileSlug(value) {
  return String(value || "grimpeur")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "grimpeur";
}
