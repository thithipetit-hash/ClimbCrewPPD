import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile, readdir, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appUrl = new URL("../src/App.jsx", import.meta.url);
const appCoreUrl = new URL("../src/AppCore.jsx", import.meta.url);
const mainUrl = new URL("../src/main.jsx", import.meta.url);
const authPageUrl = new URL("../src/components/AuthPage.jsx", import.meta.url);
const releaseEnhancementsUrl = new URL("../src/release-version-enhancements.js", import.meta.url);
const sessionStatusDisplayUrl = new URL("../src/session-status-display.js", import.meta.url);
const accountParticipantPriorityUrl = new URL("../src/account-participant-priority.js", import.meta.url);
const accountParticipantPriorityRulesUrl = new URL("../src/account-participant-priority-rules.js", import.meta.url);
const realisationModeUiUrl = new URL("../src/realisation-mode-ui.js", import.meta.url);
const viteConfigUrl = new URL("../vite.config.js", import.meta.url);
const adjustmentsUrl = new URL("../scripts/app-source-adjustments.mjs", import.meta.url);
const routeGroupingUrl = new URL("../src/lib/route-display-groups.js", import.meta.url);
const routeManagementUrl = new URL("../src/hooks/useRouteManagement.js", import.meta.url);
const participantManagementUrl = new URL("../src/hooks/useParticipantManagement.js", import.meta.url);
const profileRealisationsUrl = new URL("../src/hooks/useProfileRealisations.js", import.meta.url);
const srcDirectory = fileURLToPath(new URL("../src/", import.meta.url));

const removedFrontendLayers = [
  "brand-name-ui.js",
  "api-error-messages.js",
  "issue-13-access-page.js",
  "progression-ui.js",
  "badge-faq-ui.js",
  "climber-profile-ui.js",
  "admin-user-management.js",
  "participant-qualification-ui.js",
  "participant-account-notification-ui.js",
  "admin-user-management/index.js",
  "lib/realisation-request-mode.js",
];

const [appSource, mainSource, authPageSource, viteConfig, routeGrouping] = await Promise.all([
  readFile(appUrl, "utf8"),
  readFile(mainUrl, "utf8"),
  readFile(authPageUrl, "utf8"),
  readFile(viteConfigUrl, "utf8"),
  readFile(routeGroupingUrl, "utf8"),
]);

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if ([".js", ".jsx", ".mjs"].includes(extname(entry.name))) files.push(path);
  }
  return files;
}

test("Vite compile directement les sources React sans transformation de App", async () => {
  await assert.rejects(access(adjustmentsUrl));
  assert.equal(viteConfig.includes("app-source-adjustments"), false);
  assert.equal(viteConfig.includes("applyAppSourceAdjustments"), false);
  assert.equal(viteConfig.includes("transform(code"), false);
  assert.match(viteConfig, /plugins: \[react\(\)\]/);
});

test("App utilise directement le module de groupement des voies", () => {
  assert.match(appSource, /from "\.\/lib\/route-display-groups\.js"/);
  assert.match(appSource, /buildRouteDisplayGroups\(\{/);
  assert.equal(appSource.includes("const gradeRank = new Map(GRADES.map"), false);
  assert.match(routeGrouping, /export function buildRouteDisplayGroups/);
});

test("le noyau React historique et les patchs DOM finalisés ont disparu", async () => {
  await assert.rejects(access(appCoreUrl));
  await assert.rejects(access(releaseEnhancementsUrl));
  await assert.rejects(access(sessionStatusDisplayUrl));
  await assert.rejects(access(accountParticipantPriorityUrl));
  await assert.rejects(access(accountParticipantPriorityRulesUrl));
  await assert.rejects(access(realisationModeUiUrl));
  await Promise.all(removedFrontendLayers.map((path) => assert.rejects(access(new URL(`../src/${path}`, import.meta.url)))));
  for (const path of removedFrontendLayers) assert.equal(mainSource.includes(path), false);
});

test("aucun module source ne réécrit le DOM React ou window.fetch globalement", async () => {
  const offenders = [];
  for (const file of await sourceFiles(srcDirectory)) {
    const source = await readFile(file, "utf8");
    if (/\bMutationObserver\b/.test(source) || /window\.fetch\s*=/.test(source)) offenders.push(file);
  }
  assert.deepEqual(offenders, [], `patchs globaux encore présents : ${offenders.join(", ")}`);
});

test("le branding courant est écrit dans les sources et les métadonnées", async () => {
  const [indexSource, manifestSource] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/site.webmanifest", import.meta.url), "utf8"),
  ]);
  const offenders = [];
  for (const file of await sourceFiles(srcDirectory)) {
    const source = await readFile(file, "utf8");
    if (source.includes("ClimbClubCristal")) offenders.push(file);
  }
  assert.deepEqual(offenders, [], `ancien branding encore présent : ${offenders.join(", ")}`);
  assert.doesNotMatch(appSource, /ClimbClubCristal/);
  assert.match(appSource, /<h1>CristalClimbCrew<\/h1>/);
  assert.doesNotMatch(indexSource, /ClimbClubCristal/);
  assert.doesNotMatch(manifestSource, /ClimbClubCristal/);
  assert.match(indexSource, /CristalClimbCrew/);
});

test("la soumission des écrans d'accès appartient au composant React", () => {
  assert.match(authPageSource, /<form className="grid two"/);
  assert.match(authPageSource, /handleLogin\(\)/);
  assert.match(authPageSource, /type="submit">Se connecter/);
  assert.match(authPageSource, /Création d’un compte/);
  assert.match(authPageSource, /Consulter le texte RGPD/);
});

test("les gestions voies et participants sont extraites d'App.jsx et le budget du monolithe diminue", async () => {
  const [info, routeManagement, participantManagement, profileRealisations] = await Promise.all([
    stat(appUrl),
    readFile(routeManagementUrl, "utf8"),
    readFile(participantManagementUrl, "utf8"),
    readFile(profileRealisationsUrl, "utf8"),
  ]);
  assert.ok(info.size <= 56_000, `App.jsx fait ${info.size} octets : extraire un bloc métier avant d'ajouter du code au monolithe`);
  assert.match(appSource, /useRouteManagement/);
  assert.match(appSource, /useParticipantManagement/);
  assert.match(routeManagement, /export function useRouteManagement/);
  assert.match(participantManagement, /export function useParticipantManagement/);
  assert.match(participantManagement, /Une suppression destructive n'est jamais optimiste/);
  assert.match(profileRealisations, /export function useProfileRealisations/);
});
