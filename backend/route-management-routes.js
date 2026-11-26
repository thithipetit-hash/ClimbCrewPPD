import { installRouteCoreRoutes } from "./route-core-routes.js";
import { installRouteVideoRoutes } from "./route-video-routes.js";

export function installRouteManagementRoutes(app, dependencies) {
  installRouteCoreRoutes(app, dependencies);
  installRouteVideoRoutes(app, dependencies);
}
