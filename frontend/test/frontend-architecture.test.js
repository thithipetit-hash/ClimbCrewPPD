import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";

const appUrl = new URL("../src/App.jsx", import.meta.url);
const viteConfigUrl = new URL("../vite.config.js", import.meta.url);
const adjustmentsUrl = new URL("../scripts/app-source-adjustments.mjs", import.meta.url);

const [viteConfig, adjustments] = await Promise.all([
  readFile(viteConfigUrl, "utf8"),
  readFile(adjustmentsUrl, "utf8"),
]);

test("les transformations historiques de App sont isolées hors de vite.config", () => {
  assert.match(viteConfig, /app-source-adjustments\.mjs/);
  assert.match(viteConfig, /applyAppSourceAdjustments\(code\)/);
  assert.equal(viteConfig.includes("Cotation consensus"), false);
  assert.equal(viteConfig.includes("sidebar-theme"), false);
  assert.match(adjustments, /export function applyAppSourceAdjustments/);
});

test("App.jsx ne peut plus grossir au-delà de son budget actuel", async () => {
  const info = await stat(appUrl);
  assert.ok(
    info.size <= 93_000,
    `App.jsx fait ${info.size} octets : extraire un bloc métier avant d'ajouter du code au monolithe`,
  );
});
