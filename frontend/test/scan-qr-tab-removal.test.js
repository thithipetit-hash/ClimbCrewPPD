import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [appSource, uiConfigSource, qrFlowSource] = await Promise.all([
  readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/ui-config.js", import.meta.url), "utf8"),
  readFile(new URL("../src/hooks/useQrRealisationFlow.js", import.meta.url), "utf8"),
]);

test("l'onglet Scan QR code n'est plus exposé dans la navigation", () => {
  assert.doesNotMatch(uiConfigSource, /scan_qr|Scan QR code/);
  assert.doesNotMatch(appSource, /<ScanQr|tab === "scan_qr"/);
});

test("un lien QR ouvre directement le formulaire de réalisation de la voie", () => {
  assert.match(appSource, /useQrRealisationFlow/);
  assert.match(qrFlowSource, /searchParams\.get\("qrRoute"\)/);
  assert.match(qrFlowSource, /openScannedRoute\(routeId\)/);
  assert.match(qrFlowSource, /searchParams\.delete\("qrRoute"\)/);
});
