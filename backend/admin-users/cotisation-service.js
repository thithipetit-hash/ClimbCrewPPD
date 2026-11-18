/**
 * Report manuel des cotisations pour l'ensemble du club.
 * Une deuxième exécution sans nouvelle cotisation ne doit jamais effacer l'historique.
 * Appelé dans la transaction protégée par la sauvegarde du reset administrateur.
 */
export async function transferCotisationsToPreviousYear(client) {
  const result = await client.query(`
    update participants
    set cotisation_precedente = cotisation,
        cotisation = false
    where exists (select 1 from participants where cotisation = true)
    returning cotisation_precedente
  `);
  return {
    affected: result.rowCount,
    transferred: result.rows.filter((row) => row.cotisation_precedente === true).length,
  };
}
