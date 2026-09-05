import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const versionPattern = /^\d{8}\.\d{3}$/;

test("VERSION est l'unique numéro de version applicative", async () => {
  const [canonical, versionSource, viteSource, dockerfileSource, composeSource] = await Promise.all([
    readFile(new URL("../../VERSION", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/version.js", import.meta.url), "utf8"),
    readFile(new URL("../vite.config.js", import.meta.url), "utf8"),
    readFile(new URL("../Dockerfile.prod", import.meta.url), "utf8"),
    readFile(new URL("../../docker-compose.prod.yml", import.meta.url), "utf8"),
  ]);
  const version = canonical.trim();
  assert.match(version, versionPattern);
  assert.doesNotMatch(versionSource, /20\d{6}\.\d{3}/);
  assert.match(versionSource, /import\.meta\.env\?\.VITE_APP_VERSION/);
  assert.match(viteSource, /new URL\("\.\.\/VERSION", import\.meta\.url\)/);
  assert.match(viteSource, /process\.env\.VITE_APP_VERSION/);
  assert.match(viteSource, /"import\.meta\.env\.VITE_APP_VERSION": JSON\.stringify\(appVersion\)/);
  assert.match(dockerfileSource, /COPY VERSION \/app\/VERSION/);
  assert.match(composeSource, /context:\s*\.\s*\n\s*dockerfile:\s*frontend\/Dockerfile\.prod/);
});

test("App.jsx ne définit plus sa propre version", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /const\s+APP_VERSION\s*=/);
  assert.match(source, /import\s+\{\s*APP_VERSION\s*\}\s+from\s+"\.\/lib\/version\.js"/);
  assert.match(source, /applicationVersion:\s*APP_VERSION/);
  assert.match(source, /climbcrew_export_\$\{APP_VERSION\}\.json/);
});

test("la version n'est plus réécrite par un script DOM", async () => {
  await assert.rejects(access(new URL("../src/release-version-enhancements.js", import.meta.url)));
  const main = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.equal(main.includes("release-version-enhancements.js"), false);
});
