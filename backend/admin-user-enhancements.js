import { configureDeploymentEnvironment } from "./deployment-compatibility.js";
import { installPoolCapture } from "./admin-users/database.js";
import { installClientIpHardening } from "./admin-users/client-ip-hardening.js";
import { installExpressIntegration } from "./admin-users/express-integration.js";
import { installMigrationHook } from "./admin-users/migration-service.js";
import { installInitiatorQualificationIntegration } from "./admin-users/initiator-qualification-integration.js";

/**
 * Point d'entrée préchargé par Node avant server.js.
 *
 * Rôle : installer les adaptations transverses avant que le serveur principal
 * ne lise ses variables d'environnement et ne déclare ses routes Express.
 *
 * Impact visuel : aucun composant graphique n'est modifié directement. Cette
 * préparation évite toutefois les écrans vides, les erreurs CORS et les retours
 * à la page de connexion lorsque frontend et backend sont séparés sur Render.
 */

// 1. Fusionne les origines autorisées et applique les valeurs Render uniquement
//    lorsqu'aucune valeur explicite n'a été fournie par le serveur Linux.
configureDeploymentEnvironment();

// 2. Capture le pool PostgreSQL créé par server.js afin que les modules séparés
//    de gestion des comptes utilisent exactement la même connexion à la base.
installPoolCapture();

// 3. Normalise l'adresse cliente à partir de req.ip, donc après application de
//    la politique Express trust proxy, avant les limiteurs et les journaux.
installClientIpHardening();

// 4. Installe les routes complémentaires et la compatibilité CSRF avant que
//    server.js ne commence à enregistrer ses middlewares et ses contrôleurs.
installExpressIntegration();

// 5. Enveloppe le démarrage réseau afin d'appliquer les migrations PostgreSQL
//    versionnées une fois le schéma historique créé mais avant la première requête.
installMigrationHook();

// 6. Ajoute la route d'administration dédiée aux qualifications Initiateur.
//    Elle est installée avant l'écoute réseau et reste protégée par requireAdmin.
installInitiatorQualificationIntegration();
