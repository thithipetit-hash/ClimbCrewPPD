import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const frontendDir = resolve(scriptDir, "..");
const repoRoot = resolve(frontendDir, "..");
const outputPath = resolve(frontendDir, "public", "deployment-version.json");

const version = (await readFile(resolve(repoRoot, "VERSION"), "utf8")).trim();

let commit = process.env.GITHUB_SHA || "";
if (!commit) {
  try {
    commit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    commit = "unknown";
  }
}

const marker = {
  application: "ClimbCrew",
  version,
  commit,
  builtAt: new Date().toISOString(),
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(marker, null, 2)}\n`, "utf8");
console.log(`Deployment marker generated: ${version} (${commit})`);
