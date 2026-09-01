import { readdir, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const atlasDir = path.join(repoRoot, "frontend", "src", "assets");
const publicDir = path.join(repoRoot, "frontend", "public", "assets", "atlases");
const workflowPath = path.join(repoRoot, ".github", "workflows", "extract-atlas-assets-once.yml");
const scriptPath = path.join(repoRoot, "scripts", "extract-atlas-assets-once.mjs");
const versionPath = path.join(repoRoot, "VERSION");

const extensionByMime = new Map([
  ["image/webp", "webp"],
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/svg+xml", "svg"],
]);

const dataUriPattern = /data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)/gi;
const atlasFiles = (await readdir(atlasDir))
  .filter((name) => name.endsWith("-atlas.js"))
  .sort();

if (atlasFiles.length === 0) {
  throw new Error("Aucun fichier *-atlas.js trouvé.");
}

await mkdir(publicDir, { recursive: true });
let extractedCount = 0;

for (const atlasFile of atlasFiles) {
  const atlasPath = path.join(atlasDir, atlasFile);
  const source = await readFile(atlasPath, "utf8");
  const matches = [...source.matchAll(dataUriPattern)];

  if (matches.length === 0) continue;

  let rewritten = source;
  const stem = atlasFile.replace(/\.js$/, "");

  for (let index = 0; index < matches.length; index += 1) {
    const [dataUri, mime, payload] = matches[index];
    const extension = extensionByMime.get(mime.toLowerCase());
    if (!extension) throw new Error(`MIME non pris en charge dans ${atlasFile}: ${mime}`);

    const suffix = matches.length === 1 ? "" : `-${index + 1}`;
    const fileName = `${stem}${suffix}.${extension}`;
    const outputPath = path.join(publicDir, fileName);
    const publicUrl = `/assets/atlases/${fileName}`;
    const bytes = Buffer.from(payload, "base64");
    if (bytes.length === 0) throw new Error(`Asset vide extrait de ${atlasFile}`);

    await writeFile(outputPath, bytes);
    rewritten = rewritten.replace(dataUri, publicUrl);
    extractedCount += 1;
    console.log(`${atlasFile} -> ${publicUrl} (${bytes.length} octets)`);
  }

  if (/;base64,/i.test(rewritten)) throw new Error(`Base64 résiduel détecté dans ${atlasFile}`);
  await writeFile(atlasPath, rewritten, "utf8");
}

if (extractedCount === 0) throw new Error("Aucun asset Base64 à extraire; arrêt pour éviter un commit vide.");

await writeFile(versionPath, "20260901.004\n", "utf8");

await rm(workflowPath, { force: true });
await rm(scriptPath, { force: true });
console.log(`Extraction terminée: ${extractedCount} asset(s).`);
