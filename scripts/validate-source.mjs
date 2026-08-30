import fs from "node:fs";

function fail(message) {
  console.error(`Validation source échouée : ${message}`);
  process.exitCode = 1;
}

const app = fs.readFileSync("frontend/src/App.jsx", "utf8");
const domain = fs.readFileSync("frontend/src/lib/domain.js", "utf8");
const frontendDockerfile = fs.readFileSync("frontend/Dockerfile.prod", "utf8");
const dayStart = app.indexOf("const daySessions = useMemo");
const weekStart = app.indexOf("const weekDates = useMemo", dayStart);
const dayBlock = dayStart >= 0 && weekStart > dayStart ? app.slice(dayStart, weekStart) : "";
if (!dayBlock) fail("bloc daySessions introuvable");
if (dayBlock.includes("defaultSessionStatus(date, slot)")) fail("référence indéfinie date dans daySessions");
if (!dayBlock.includes("defaultSessionStatus(selectedDate, slot)")) fail("statut par défaut de daySessions non sécurisé");

const main = fs.readFileSync("frontend/src/main.jsx", "utf8");
if (!main.includes("<ErrorBoundary>")) fail("ErrorBoundary absent du point d’entrée React");
if (main.includes("climbcrew-enhancements.js") || fs.existsSync("frontend/src/climbcrew-enhancements.js") || fs.existsSync("frontend/src/climbcrew-enhancements-legacy.js")) {
  fail("ancienne couche frontend legacy encore présente");
}

const backendPackage = JSON.parse(fs.readFileSync("backend/package.json", "utf8"));
const allowedBackendStartCommands = new Set([
  "node server.js",
  "node --import ./deployment-bootstrap.js server.js",
]);
if (!allowedBackendStartCommands.has(backendPackage.scripts?.start)) {
  fail("commande de démarrage backend non reconnue");
}
if (backendPackage.scripts?.start.includes("deployment-bootstrap.js")
    && !fs.existsSync("backend/deployment-bootstrap.js")) {
  fail("préchargement deployment-bootstrap.js introuvable");
}
if (fs.existsSync("backend/server-runtime.js")) fail("server-runtime.js ne doit plus être utilisé");

if (app.includes("multi-signup") || app.includes('name="participantIds"')) fail("la sélection multiple des inscriptions est encore présente");
if (app.includes("Sans nom") || app.includes("Voie sans nom")) fail("un libellé Sans nom est encore affiché");
if (!domain.includes("function formatRouteName(route)")) fail("formatage ouvreur puis nom de voie absent");
if (!app.includes("async function deleteRealisation(realisation)")) fail("suppression de réalisation absente de la progression");
if (!app.includes("state.routes.map((route) => normalizeRopeNumber(route.numeroCorde))")) fail("les cordes vides ne sont pas masquées");
if (app.includes("l’ocre apparaît sur fond marron") || main.includes("l’ocre apparaît sur fond marron")) {
  fail("mention ocre sur fond marron encore présente dans le frontend");
}

const backend = fs.readFileSync("backend/server.js", "utf8");
const explicitRoutes = fs.readFileSync("backend/admin-users/explicit-routes.js", "utf8");
const sessionAuthorization = fs.readFileSync("backend/admin-users/session-authorization-service.js", "utf8");
const backendSessionDefaultStatus = fs.readFileSync("backend/session-default-status.js", "utf8");
const sharedSessionDefaultStatus = fs.readFileSync("shared/session-default-status.js", "utf8");
const realisationManagement = fs.readFileSync("backend/realisation-management-routes.js", "utf8");

// PUT /sessions/:id est désormais déclaré explicitement avec son contrôleur sécurisé.
if (!backend.includes("installExplicitAdminUserRoutes(app")) {
  fail("module de routes utilisateurs explicites non installé");
}
if (!explicitRoutes.includes('app.put("/sessions/:id", requireAuth, updateSessionWithAuthorization);')) {
  fail("contrôleur sécurisé des séances non branché explicitement");
}
if (backend.includes("legacyReplacedRoute") || fs.existsSync("backend/admin-users/express-integration.js")) {
  fail("ancien câblage Express legacy encore présent");
}
if (backend.includes("function defaultSessionStatus(")) {
  fail("ancienne copie morte de la règle de statut encore présente dans server.js");
}

// La règle canonique appartient désormais à /shared. Le fichier backend reste
// uniquement un adaptateur de compatibilité pendant la réduction de dette.
if (!sharedSessionDefaultStatus.includes("export function getDefaultSessionStatus(date, slot)")) {
  fail("règle canonique partagée de statut par défaut absente");
}
if (backendSessionDefaultStatus.includes("function getDefaultSessionStatus(")) {
  fail("la règle de statut est encore dupliquée dans backend/session-default-status.js");
}
if (!backendSessionDefaultStatus.includes('from "../shared/session-default-status.js"')) {
  fail("ré-export backend non branché sur la règle partagée");
}
if (!sessionAuthorization.includes('import { getDefaultSessionStatus } from "../session-default-status.js";')) {
  fail("contrôleur de séances non branché sur l’adaptateur de statut");
}
if (!sessionAuthorization.includes("const resolvedStatus = requested.status")) {
  fail("statut de séance non résolu dans le contrôleur actif");
}
if (!sessionAuthorization.includes("getDefaultSessionStatus(requested.date, requested.slot)")) {
  fail("règle canonique de statut non utilisée lors de la résolution du statut");
}
if (domain.includes("export function defaultSessionStatus")) {
  fail("duplication frontend de la règle de statut par défaut encore présente");
}
if (!domain.includes('export { getDefaultSessionStatus as defaultSessionStatus } from "../../../shared/session-default-status.js";')) {
  fail("frontend non branché directement sur la règle partagée de statut");
}
if (domain.includes("../../../backend/session-default-status.js")) {
  fail("couplage frontend vers backend/session-default-status.js encore présent");
}
if (!frontendDockerfile.includes("COPY shared/ /app/shared/")) {
  fail("modules métier partagés absents du contexte de build frontend Docker");
}
if (frontendDockerfile.includes("COPY backend/session-default-status.js /app/backend/session-default-status.js")) {
  fail("adaptateur backend encore embarqué inutilement dans l’image frontend");
}
if (!sessionAuthorization.includes("const newlyAdded =")
    || !sessionAuthorization.includes("assertLibreEligibility")) {
  fail("contrôle des nouvelles inscriptions en séance libre absent");
}
if (!sessionAuthorization.includes('requestedStatus === "fermee"')) {
  fail("blocage des nouvelles inscriptions en séance fermée absent");
}

// Les écritures de réalisations sont maintenant installées depuis un module dédié.
if (!backend.includes("installRealisationManagementRoutes(app, { requireAuth, pool });")) {
  fail("module d’écriture des réalisations non installé");
}
if (!realisationManagement.includes('app.post("/realisations", requireAuth, async')
    || !realisationManagement.includes('app.put("/realisations/:id", requireAuth, async')
    || !realisationManagement.includes('app.delete("/realisations/:id", requireAuth, async')) {
  fail("API d’écriture des réalisations incomplète");
}
if (!realisationManagement.includes("delete from realisations where id = $1 and participant_id = $2")) {
  fail("suppression de réalisation non limitée au propriétaire");
}

if (!process.exitCode) console.log("Validation source ClimbCrew réussie.");
