let sharedPool = null;

/**
 * Enregistre explicitement la connexion PostgreSQL créée par le serveur principal.
 * Les services séparés réutilisent ainsi exactement le même pool sans modifier
 * globalement le constructeur fourni par le module `pg`.
 */
export function setPool(pool) {
  if (!pool || typeof pool.query !== "function") {
    throw new TypeError("Pool PostgreSQL ClimbCrew invalide");
  }
  sharedPool = pool;
}

/** Retourne la connexion partagée ou lève une erreur explicite. */
export function getPool() {
  if (!sharedPool) {
    throw new Error("Connexion PostgreSQL ClimbCrew introuvable");
  }
  return sharedPool;
}
