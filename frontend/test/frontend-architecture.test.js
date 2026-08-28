import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { applyAppSourceAdjustments } from "../scripts/app-source-adjustments.mjs";

const appUrl = new URL("../src/App.jsx", import.meta.url);
const viteConfigUrl = new URL("../vite.config.js", import.meta.url);
const adjustmentsUrl = new URL("../scripts/app-source-adjustments.mjs", import.meta.url);
const routeGroupingUrl = new URL("../src/lib/route-display-groups.js", import.meta.url);

const [appSource, viteConfig, adjustments, routeGrouping] = await Promise.all([
  readFile(appUrl, "utf8"),
  readFile(viteConfigUrl, "utf8"),
  readFile(adjustmentsUrl, "utf8"),
  readFile(routeGroupingUrl, "utf8"),
]);

test("les transformations historiques de App sont isolées hors de vite.config", () => {
  assert.match(viteConfig, /app-source-adjustments\.mjs/);
  assert.match(viteConfig, /applyAppSourceAdjustments\(code\)/);
  assert.equal(viteConfig.includes("Cotation consensus"), false);
  assert.equal(viteConfig.includes("sidebar-theme"), false);
  assert.match(adjustments, /export function applyAppSourceAdjustments/);
});

test("le build retire de App la logique métier de groupement des voies", () => {
  const transformed = applyAppSourceAdjustments(appSource);
  assert.match(transformed, /buildRouteDisplayGroups\(\{/);
  assert.match(transformed, /from "\.\/lib\/route-display-groups\.js"/);
  assert.equal(transformed.includes("const gradeRank = new Map(GRADES.map"), false);
  assert.match(routeGrouping, /export function buildRouteDisplayGroups/);
  assert.ok(
    transformed.length < appSource.length - 700,
    `l'extraction doit réduire sensiblement le code App compilé (${appSource.length} -> ${transformed.length})`,
  );
});

test("App.jsx ne peut plus grossir au-delà de son budget actuel", async () => {
  const info = await stat(appUrl);
  assert.ok(
    info.size <= 93_000,
    `App.jsx fait ${info.size} octets : extraire un bloc métier avant d'ajouter du code au monolithe`,
  );
});
