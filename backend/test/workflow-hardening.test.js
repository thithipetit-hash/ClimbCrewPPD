import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const workflowsUrl = new URL("../../.github/workflows/", import.meta.url);

async function workflow(name) {
  return readFile(new URL(name, workflowsUrl), "utf8");
}

test("le contrôle vidéo sépare le proxy local du TLS public", async () => {
  const source = await workflow("ensure-preprod-nginx-upload.yml");
  assert.match(source, /verify_local_nginx:/);
  assert.match(source, /runs-on: self-hosted/);
  assert.match(source, /-H "Host: \${DOMAIN}"/);
  assert.match(source, /http:\/\/127\.0\.0\.1\/api\/realisations\/proxy-limit-probe/);
  assert.doesNotMatch(source, /--resolve "\\?\$\{DOMAIN\}:443:127\.0\.0\.1"/);
  assert.match(source, /verify_public_chunk:/);
  assert.match(source, /runs-on: ubuntu-latest/);
});

test("les sauvegardes sont aussi contrôlées quotidiennement", async () => {
  const source = await workflow("verify-backups.yml");
  assert.match(source, /schedule:/);
  assert.match(source, /cron: "30 4 \* \* \*"/);
  assert.match(source, /github\.event_name == 'schedule'/);
});

test("le déploiement main exige une PR associée", async () => {
  const source = await workflow("deploy.yml");
  assert.match(source, /Vérifier que main provient d'une Pull Request/);
  assert.match(source, /commits\/\$\{COMMIT_SHA\}\/pulls/);
  assert.match(source, /un push direct vers main ne peut pas être déployé/);
  assert.match(source, /degraded/);
});

test("le déploiement PPD synchronise l'origine publique du backend", async () => {
  const source = await workflow("deploy.yml");
  assert.match(source, /set_env_var PUBLIC_URL "https:\/\/\$\{PPD_DOMAIN\}"/);
  assert.match(source, /set_env_var FRONTEND_ORIGIN "https:\/\/\$\{PPD_DOMAIN\}"/);
  assert.match(source, /set_env_var CORS_ORIGIN "https:\/\/\$\{PPD_DOMAIN\}"/);
});

test("les actions GitHub critiques sont épinglées par SHA", async () => {
  const entries = await readdir(workflowsUrl, { withFileTypes: true });
  const offenders = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/\.ya?ml$/i.test(entry.name)) continue;
    const source = await workflow(entry.name);
    if (/actions\/(?:checkout|setup-node)@v\d+/i.test(source)) offenders.push(entry.name);
  }
  assert.deepEqual(offenders, [], `Actions non épinglées : ${offenders.join(", ")}`);
});
