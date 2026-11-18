import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/components/RouteRealisationStatisticsTable.jsx", import.meta.url), "utf8");

test("les filtres du tableau de réalisations restent contenus dans leur colonne", () => {
  assert.match(source, /minWidth: 1280/);
  assert.match(source, /minWidth: column\.key === "route" \? 180 : column\.key === "grade" \? 100 : 90/);
  assert.match(source, /width: "100%",\s*maxWidth: "100%",\s*minWidth: 0,\s*display: "block",\s*boxSizing: "border-box"/);
  assert.doesNotMatch(source, /width: column\.key === "route" \? 150 : 86/);
});
