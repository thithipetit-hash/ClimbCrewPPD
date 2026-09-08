import fs from "node:fs";

function fail(message) {
  console.error(`Validation source échouée : ${message}`);
  process.exitCode = 1;
}

const app = fs.readFileSync("frontend/src/App.jsx", "utf8");
const domain = fs.readFileSync("frontend/src/lib/domain.js", "utf8");
const routeDisplayGroups = fs.readFileSync("frontend/src/lib/route-display-groups.js", "utf8");
const viteConfig = fs.readFileSync("frontend/vite.config.js", "utf8");
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
if (fs.existsSync("frontend/scripts/app-source-adjustments.mjs")) {
  fail("transformation historique de App encore présente");
}
if (viteConfig.includes("app-source-adjustments")
    || viteConfig.includes("applyAppSourceAdjustments")
    || viteConfig.includes("transform(code")) {
  fail("Vite transforme encore App.jsx avant compilation");
}
if (!viteConfig.includes("plugins: [react()]")) {
  fail("configuration Vite React canonique introuvable");
}
if (!app.includes('import { buildRouteDisplayGroups } from "./lib/route-display-groups.js";')
    || !app.includes("buildRouteDisplayGroups({")) {
  fail("App non branché directement sur le module de groupement des voies");
}
if (app.includes("const gradeRank = new Map(GRADES.map")) {
  fail("copie locale du groupement des voies encore présente dans App");
}
if (!routeDisplayGroups.includes("export function buildRouteDisplayGroups")
    || !routeDisplayGroups.includes("routes.map((route) => normalizeRopeNumber(route.numeroCorde))")) {
  fail("module de groupement des voies incomplet ou cordes vides non masquées");
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
if (app.includes("l’ocre apparaît sur fond marron") || main.includes("l’ocre apparaît sur fond marron")) {
  fail("mention ocre sur fond marron encore présente dans le frontend");
}

const backend = fs.readFileSync("backend/server.js", "utf8");
const runtimeConfig = fs.readFileSync("backend/config/runtime-config.js", "utf8");
const httpStack = fs.readFileSync("backend/middleware/http-stack.js", "utf8");
const runtimeHelpers = fs.readFileSync("backend/security/runtime-helpers.js", "utf8");
const applicationBootstrap = fs.readFileSync("backend/bootstrap/application-bootstrap.js", "utf8");
const explicitRoutes = fs.readFileSync("backend/admin-users/explicit-routes.js", "utf8");
const sessionAuthorization = fs.readFileSync("backend/admin-users/session-authorization-service.js", "utf8");
const realisationManagement = fs.readFileSync("backend/realisation-management-routes.js", "utf8");
const baselineMigration = fs.readFileSync("backend/database/migrations/001_baseline.sql", "utf8");

if (backend.includes("async function ensureSchema()")) {
  fail("DDL legacy ensureSchema encore présent dans server.js");
}
if (!applicationBootstrap.includes('import { runDatabaseMigrations } from "../database/migrate.js";')
    || !applicationBootstrap.includes("await runDatabaseMigrations(pool);")) {
  fail("bootstrap backend non branché sur le runner de migrations");
}
if (!backend.includes('import { createRuntimeConfig, createDatabasePool } from "./config/runtime-config.js";')
    || !backend.includes('import { installHttpStack } from "./middleware/http-stack.js";')
    || !backend.includes('from "./bootstrap/application-bootstrap.js";')) {
  fail("server.js n'est pas réduit à son rôle de composition");
}
if (backend.includes("app.set(\"trust proxy\"") || backend.includes("res.setHeader(\"Content-Security-Policy\"")) {
  fail("configuration HTTP transversale encore présente dans server.js");
}
if (!runtimeConfig.includes("export function createRuntimeConfig")
    || !runtimeConfig.includes("export function createDatabasePool")) {
  fail("configuration runtime ou pool PostgreSQL non externalisés");
}
if (!httpStack.includes("export function installHttpStack")
    || !httpStack.includes("Content-Security-Policy")
    || !httpStack.includes("writeRateLimit")) {
  fail("pile middleware HTTP externalisée incomplète");
}
if (!runtimeHelpers.includes("export function hashToken")
    || !runtimeHelpers.includes("export function createCookieWriters")) {
  fail("helpers de sécurité runtime non externalisés");
}
if (!baselineMigration.includes("create table if not exists participants")
    || !baselineMigration.includes("create table if not exists users")
    || !baselineMigration.includes("create table if not exists routes")
    || !baselineMigration.includes("create table if not exists realisations")) {
  fail("migration baseline PostgreSQL incomplète");
}

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

if (fs.existsSync("backend/session-default-status.js")) {
  fail("adaptateur backend session-default-status.js encore présent");
}
if (!sessionAuthorization.includes('import { getDefaultSessionStatus } from "../../shared/session-default-status.js";')) {
  fail("contrôleur de séances non branché directement sur la règle partagée");
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

if (!backend.includes("installRealisationManagementRoutes(app, { requireAuth, pool });")) {
  fail("module d’écriture des réalisations non installé");
}

if (!process.exitCode) console.log("Validation source ClimbCrew réussie.");
