import { configureDeploymentEnvironment } from "./deployment-compatibility.js";

/**
 * Point d'entrée préchargé par Node avant server.js.
 *
 * Il ne modifie plus globalement Express ni PostgreSQL. Les middlewares, routes,
 * migrations et connexions sont enregistrés explicitement par server.js.
 */
configureDeploymentEnvironment();
