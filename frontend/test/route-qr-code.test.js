import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/components/RouteQrCode.jsx", import.meta.url), "utf8");
const routesPageSource = await readFile(new URL("../src/pages/Voies.jsx", import.meta.url), "utf8");

test("les QR codes sont générés localement sans service externe", () => {
  assert.match(source, /from "\.\.\/vendor\/qrcode\.mjs"/);
  assert.match(source, /qrcode\(0, "M"\)/);
  assert.match(source, /data:image\/svg\+xml/);
  assert.doesNotMatch(source, /quickchart|googleapis|chart\.google/i);
});

test("les QR codes contiennent une URL web vers la voie", () => {
  assert.match(source, /new URL\("\/", origin\)/);
  assert.match(source, /searchParams\.set\("qrRoute"/);
  assert.doesNotMatch(source, /climbcrew:voie:/);
});

test("l'accès aux QR codes de voies est réservé aux administrateurs", () => {
  assert.match(
    routesPageSource,
    /const qrRoute = adminUnlocked[\s\S]*?allRoutes\.find/,
  );
  assert.match(
    routesPageSource,
    /\{adminUnlocked && <Button variant="secondary" onClick=\{\(\) => setQrRouteId\(route\.id\)\}>QR code<\/Button>\}/,
  );
});
