import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

test("aucun fichier d'import nominatif n'est suivi dans le dépôt public", () => {
  const trackedImports = execFileSync("git", ["ls-files", "--", "docs/imports"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
  assert.equal(trackedImports, "", "Les imports de club ne doivent pas être suivis dans Git.");
});
