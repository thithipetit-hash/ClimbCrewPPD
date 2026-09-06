import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const apiSource = readFileSync(new URL("../src/lib/api.js", import.meta.url), "utf8");
const frontendNginx = readFileSync(new URL("../nginx.prod.conf", import.meta.url), "utf8");
const externalProxy = readFileSync(new URL("../../deploy/nginx/climbcrew.reverse-proxy.example.conf", import.meta.url), "utf8");

test("les erreurs 413 de chargement sont explicites", () => {
  assert.match(apiSource, /413:\s*"Le fichier est trop volumineux pour le serveur ou son proxy\. Taille maximale : 50 Mo\."/);
});

test("les deux reverse proxies laissent passer les vidéos ClimbCrew de 50 Mo", () => {
  assert.match(frontendNginx, /client_max_body_size\s+55m;/);
  assert.match(externalProxy, /client_max_body_size\s+55m;/);
  assert.doesNotMatch(externalProxy, /client_max_body_size\s+10m;/);
});
