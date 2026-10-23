import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

test("l'accueil de novembre affiche une illustration aléatoire issue des vingt cases de la planche", () => {
  const asset = new URL("../public/media/seasonal/november-2026/pumpkins-sprite.webp", import.meta.url);
  assert.ok(existsSync(asset), "La planche WebP des citrouilles doit être livrée avec l'application");
  const source = readFileSync(new URL("../src/components/NovemberPumpkinWelcome.jsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/styles/november-pumpkins.css", import.meta.url), "utf8");
  assert.match(source, /index % 5/);
  assert.match(source, /Math.floor\(index \/ 5\)/);
  assert.match(styles, /background-size: 500% 400%/);
  assert.match(styles, /pumpkins-sprite\.webp/);
  assert.ok(readFileSync(fileURLToPath(asset)).byteLength > 1000);
});
