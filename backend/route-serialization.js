export function routeDbToApi(row) {
  return {
    id: row.id,
    numeroVoieUnique: row.numero_voie_unique,
    numeroCorde: row.numero_corde === null ? null : Number(row.numero_corde),
    couleurPrises: row.couleur_prises || "",
    cotationReference: row.cotation_reference || "",
    cotationAjustee: row.cotation_ajustee || row.cotation_reference || "",
    nomVoie: row.nom_voie || "",
    nomOuvreur: row.nom_ouvreur || "",
    moulinetteOnly: Boolean(row.moulinette_only),
    tags: Array.isArray(row.tags) ? row.tags : [],
    videoUrls: Array.isArray(row.video_urls) ? row.video_urls : [],
    active: Boolean(row.active),
    dateCreation: row.date_creation || "",
    ratingAverage: Number(row.rating_average || 0),
    ratingCount: Number(row.rating_count || 0),
  };
}
