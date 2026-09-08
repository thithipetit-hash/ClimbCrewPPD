import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const hostProxyUrl = new URL("../../deploy/nginx/climbcrew.reverse-proxy.example.conf", import.meta.url);
const frontendProxyUrl = new URL("../nginx.prod.conf", import.meta.url);
const apiSourceUrl = new URL("../src/lib/api.js", import.meta.url);

function configuredMegabytes(source) {
  const match = source.match(/client_max_body_size\s+(\d+)m\s*;/i);
  return match ? Number(match[1]) : 0;
}

test("les reverse proxies acceptent les vidéos de 50 Mo autorisées par ClimbCrew", async () => {
  const [hostProxy, frontendProxy] = await Promise.all([
    readFile(hostProxyUrl, "utf8"),
    readFile(frontendProxyUrl, "utf8"),
  ]);

  assert.ok(
    configuredMegabytes(hostProxy) >= 55,
    "Le reverse proxy HTTPS hôte doit laisser une marge au-dessus de la limite vidéo de 50 Mo.",
  );
  assert.ok(
    configuredMegabytes(frontendProxy) >= 55,
    "Le reverse proxy frontend doit laisser une marge au-dessus de la limite vidéo de 50 Mo.",
  );
});

test("une réponse 413 produit un message compréhensible pendant un upload", async () => {
  const apiSource = await readFile(apiSourceUrl, "utf8");
  assert.match(apiSource, /413:\s*"Le fichier envoyé est trop volumineux pour le serveur\."/);
});
