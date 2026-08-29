import { configureDeploymentEnvironment } from "./deployment-compatibility.js";
import { installCookieHardening } from "./admin-users/cookie-hardening.js";
import { installPreBodyRateLimit } from "./admin-users/prebody-rate-limit.js";
import { installClientIpHardening } from "./admin-users/client-ip-hardening.js";
import { installRateLimitLogIntegration } from "./admin-users/rate-limit-log-integration.js";
import { installInitiatorQualificationIntegration } from "./admin-users/initiator-qualification-integration.js";

/**
 * Point d'entrée préchargé par Node avant server.js.
 *
 * Seules les adaptations réellement transverses restent préchargées. Les routes,
 * les migrations, la connexion PostgreSQL et le cycle de vie HTTP sont désormais
 * câblés explicitement par server.js au lieu de modifier globalement Express ou pg.
 */
configureDeploymentEnvironment();

// L'ordre est volontaire : cookie sûr -> limite précoce -> IP canonique -> logs.
installCookieHardening();
installPreBodyRateLimit();
installClientIpHardening();
installRateLimitLogIntegration();
installInitiatorQualificationIntegration();
