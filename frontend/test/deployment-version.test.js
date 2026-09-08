import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("le build publie un marqueur correspondant à VERSION", async () => {
  await execFileAsync(process.execPath, ["scripts/prepare-deployment-version.mjs"], {
    cwd: new URL("..", import.meta.url),
  });

  const expectedVersion = (await readFile(new URL("../../VERSION", import.meta.url), "utf8")).trim();
  const marker = JSON.parse(await readFile(new URL("../public/deployment-version.json", import.meta.url), "utf8"));

  assert.equal(marker.application, "ClimbCrew");
  assert.equal(marker.version, expectedVersion);
  assert.match(marker.commit, /^(?:[0-9a-f]{40}|unknown)$/);
  assert.ok(!Number.isNaN(Date.parse(marker.builtAt)));
});
