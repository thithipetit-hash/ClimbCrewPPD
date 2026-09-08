/**
 * Configuration centralisée des évolutions liées aux comptes utilisateurs.
 *
 * Rôle : partager les mêmes noms de cookies, niveaux de sécurité et indicateurs
 * d'installation entre les modules séparés du backend.
 *
 * Impact visuel : aucun style n'est produit ici. Une incohérence sur ces valeurs
 * se traduirait cependant par une connexion qui semble fonctionner puis par des
 * erreurs 401/403 dans les écrans Administration et Gestion des comptes.
 */

function envBoolean(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "oui", "on"].includes(String(value).trim().toLowerCase());
}

/**
 * Vérifie que le serveur historique est bien démarré avec le préchargement qui
 * installe les protections de confidentialité, CSRF, IP et migrations.
 *
 * Le contrôle ne s'applique qu'au véritable point d'entrée server.js en
 * production : les tests unitaires et les imports d'outils restent utilisables.
 */
export function hasRequiredEnhancementPreload({
  nodeEnv = process.env.NODE_ENV,
  argv = process.argv,
  execArgv = process.execArgv,
} = {}) {
  const serverEntrypoint = /(?:^|[\\/])server\.js$/.test(String(argv?.[1] || ""));
  if (nodeEnv !== "production" || !serverEntrypoint) return true;

  return (execArgv || []).some((value, index, values) => {
    const arg = String(value || "");
    if (/^--import=.*deployment-bootstrap\.js(?:$|[?#])/.test(arg)) return true;
    if (arg === "--import") {
      return /deployment-bootstrap\.js(?:$|[?#])/.test(String(values?.[index + 1] || ""));
    }
    return false;
  });
}

if (!hasRequiredEnhancementPreload()) {
  throw new Error(
    "Démarrage production refusé : utilise `npm start` afin de précharger deployment-bootstrap.js. " +
    "Le lancement direct `node server.js` contournerait des protections de sécurité.",
  );
}

/** Nom du cookie HttpOnly qui contient le jeton de session utilisateur. */
export const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "climbcrew_session";

/** Nom du cookie lisible utilisé pour la protection contre les requêtes CSRF. */
export const CSRF_COOKIE_NAME = process.env.CSRF_COOKIE_NAME || "climbcrew_csrf";

/**
 * Lorsque cette option vaut false, la vérification de l'adresse e-mail active
 * automatiquement le compte. Elle reste configurable pour pouvoir rétablir
 * ultérieurement une approbation manuelle sans modifier le code.
 */
export const REQUIRE_ADMIN_ACCOUNT_APPROVAL = envBoolean(
  "REQUIRE_ADMIN_ACCOUNT_APPROVAL",
  false,
);

/**
 * Coût de hachage bcrypt.
 * La production utilise une valeur plus élevée afin de ralentir les attaques
 * par essais successifs, au prix d'un temps de connexion légèrement supérieur.
 */
export const BCRYPT_ROUNDS = Number(
  process.env.BCRYPT_ROUNDS || (process.env.NODE_ENV === "production" ? 12 : 10)
);

/** Durée de validité, en millisecondes, d'un code de réinitialisation. */
export const RESET_TOKEN_DURATION_MS = 1000 * 60 * Number(
  process.env.RESET_TOKEN_DURATION_MINUTES || 60
);

/** Empêche l'ajout plusieurs fois des routes complémentaires sur une même application. */
export const INSTALL_FLAG = Symbol.for("climbcrew.adminUserEnhancements.installed");

/** Empêche l'installation répétée du middleware de compatibilité CSRF. */
export const CSRF_BRIDGE_FLAG = Symbol.for("climbcrew.crossOriginCsrfBridge.installed");

/** Empêche de modifier plusieurs fois les méthodes du prototype Express. */
export const EXPRESS_PATCH_FLAG = Symbol.for("climbcrew.expressIntegration.patched");
