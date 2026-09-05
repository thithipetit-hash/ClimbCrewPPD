import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";

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

const [appSource, mainSource, authPageSource, viteConfig, routeGrouping] = await Promise.all([
  readFile(appUrl, "utf8"),
  readFile(mainUrl, "utf8"),
  readFile(authPageUrl, "utf8"),
  readFile(viteConfigUrl, "utf8"),
  readFile(routeGroupingUrl, "utf8"),
]);

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
  assert.equal(mainSource.includes("release-version-enhancements.js"), false);
  assert.equal(mainSource.includes("session-status-display.js"), false);
  assert.equal(mainSource.includes("account-participant-priority.js"), false);
  assert.equal(mainSource.includes("realisation-mode-ui.js"), false);
});

test("la soumission des écrans d'accès appartient au composant React", () => {
  assert.match(authPageSource, /<form className="grid two"/);
  assert.match(authPageSource, /onSubmit=\{\(event\) => \{ event\.preventDefault\(\); handleLogin\(\); \}\}/);
  assert.match(authPageSource, /type="submit">Se connecter/);
});

test("App.jsx ne peut plus regrossir au-delà du budget obtenu après extraction", async () => {
  const info = await stat(appUrl);
  assert.ok(
    info.size <= 72_000,
    `App.jsx fait ${info.size} octets : extraire un bloc métier avant d'ajouter du code au monolithe`,
  );
});
