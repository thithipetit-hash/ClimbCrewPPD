import { createSecurityConfig } from "../config/security-config.js";

const SECURITY_CONFIG = createSecurityConfig(process.env);

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
 * Les comptes restent systématiquement pending après vérification e-mail.
 * Leur association à une fiche grimpeur et leur activation sont des actions
 * administrateur explicites.
 */
export const ACCOUNT_REQUEST_NOTIFICATION_RECIPIENTS = String(
  process.env.ACCOUNT_REQUEST_NOTIFICATION_RECIPIENTS || "",
)
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

/**
 * Coût de hachage bcrypt.
 * La production utilise une valeur plus élevée afin de ralentir les attaques
 * par essais successifs, au prix d'un temps de connexion légèrement supérieur.
 */
export const BCRYPT_ROUNDS = SECURITY_CONFIG.bcryptRounds;

/** Durées et politique cookie canoniques partagées avec le serveur principal. */
export const SESSION_DURATION_MS = SECURITY_CONFIG.sessionDurationMs;
export const RESET_TOKEN_DURATION_MS = SECURITY_CONFIG.resetTokenDurationMs;
export const COOKIE_SAMESITE = SECURITY_CONFIG.cookieSameSite;
export const SECURE_COOKIES = SECURITY_CONFIG.secureCookies;

/** Empêche l'ajout plusieurs fois des routes complémentaires sur une même application. */
export const INSTALL_FLAG = Symbol.for("climbcrew.adminUserEnhancements.installed");

/** Empêche l'installation répétée du middleware de compatibilité CSRF. */
export const CSRF_BRIDGE_FLAG = Symbol.for("climbcrew.crossOriginCsrfBridge.installed");

/** Empêche de modifier plusieurs fois les méthodes du prototype Express. */
export const EXPRESS_PATCH_FLAG = Symbol.for("climbcrew.expressIntegration.patched");
