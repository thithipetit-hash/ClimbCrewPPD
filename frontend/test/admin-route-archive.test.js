import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const administration = await readFile(new URL("../src/pages/Administration.jsx", import.meta.url), "utf8");
const archiveSection = await readFile(new URL("../src/components/AdminRouteArchiveSection.jsx", import.meta.url), "utf8");

test("Administration délègue l'archivage global à un composant dédié", () => {
  assert.match(administration, /<AdminRouteArchiveSection \/>/);
  assert.doesNotMatch(administration, /Promise\.allSettled\(/);
});

test("l'archivage global utilise uniquement l'endpoint batch admin", () => {
  assert.match(archiveSection, /apiFetch\("\/admin\/routes\/archive-active", \{ method: "POST" \}\)/);
  assert.doesNotMatch(archiveSection, /method: "PUT"/);
  assert.doesNotMatch(archiveSection, /apiFetch\(`\/routes\//);
});
