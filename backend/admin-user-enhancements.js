import { configureDeploymentEnvironment } from "./deployment-compatibility.js";
import { installPoolCapture } from "./admin-users/database.js";
import { installCookieHardening } from "./admin-users/cookie-hardening.js";
import { installPreBodyRateLimit } from "./admin-users/prebody-rate-limit.js";
import { installClientIpHardening } from "./admin-users/client-ip-hardening.js";
import { installRateLimitLogIntegration } from "./admin-users/rate-limit-log-integration.js";
import { installMigrationHook } from "./admin-users/migration-service.js";
import { installInitiatorQualificationIntegration } from "./admin-users/initiator-qualification-integration.js";

/**
 * Point d'entrée préchargé par Node avant server.js.
 *
 * Seules les adaptations réellement transverses restent préchargées. Les routes
 * et le cycle de vie HTTP sont désormais enregistrés explicitement par server.js
 * au lieu de surcharger express.application.get/post/put/patch/delete/listen.
 */
configureDeploymentEnvironment();
installPoolCapture();

// L'ordre est volontaire : cookie sûr -> limite précoce -> IP canonique -> logs.
installCookieHardening();
installPreBodyRateLimit();
installClientIpHardening();
installRateLimitLogIntegration();
installMigrationHook();
installInitiatorQualificationIntegration();
