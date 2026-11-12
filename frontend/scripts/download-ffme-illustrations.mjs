import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FFME_COMPETENCES } from "../src/lib/competences-ffme.js";

// Import ponctuel des pages officielles FFME pour usage local autorisé par le club.
// Les PDF officiels sont conservés à l'identique ; les JPEG permettent la lecture native intégrée.
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const target = path.join(projectRoot, "public/assets/competences-ffme");
const scratch = mkdtempSync(path.join(tmpdir(), "climbcrew-ffme-"));
const MAX_PAGES = 15;
const MAX_PDF_BYTES = 25_000_000;

function run(binary, args) {
  const result = spawnSync(binary, args, { encoding: "utf8", maxBuffer: 1_000_000 });
  if (result.error || result.status !== 0) {
    throw new Error(binary + " failed: " + (result.stderr || result.error?.message || result.stdout || result.status));
  }
  return result.stdout;
}

try {
  mkdirSync(target, { recursive: true });
  const manifest = {};
  const pdfs = {};
  let total = 0;
  for (const item of FFME_COMPETENCES) {
    if (!/^https:\/\/www\.ffme\.fr\/wp-content\/uploads\/[a-zA-Z0-9/_.-]+\.pdf$/i.test(item.pdfUrl)) {
      throw new Error("URL source non FFME : " + item.id);
    }
    const sourceFile = path.join(scratch, item.id + ".pdf");
    run("curl", [
      "--fail", "--location", "--silent", "--show-error",
      "--retry", "2", "--connect-timeout", "15", "--max-time", "90",
      "--max-filesize", String(MAX_PDF_BYTES),
      "--user-agent", "ClimbCrew FFME Atlas/1.0 (+https://pre-climbcrew.dip-tcs.com)",
      "--output", sourceFile, item.pdfUrl,
    ]);
    const sourceBytes = readFileSync(sourceFile);
    if (sourceBytes.byteLength > MAX_PDF_BYTES || sourceBytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new Error("Document PDF FFME invalide ou trop volumineux : " + item.id);
    }
    const details = run("pdfinfo", [sourceFile]);
    const found = details.match(/^Pages:\s+(\d+)\s*$/m);
    const pageCount = Number(found?.[1]);
    if (!Number.isSafeInteger(pageCount) || pageCount < 1 || pageCount > MAX_PAGES) {
      throw new Error("Nombre de pages imprévu pour " + item.id + ": " + pageCount);
    }
    if (pageCount !== item.pages) {
      throw new Error("Nombre de pages de " + item.id + " : source = " + pageCount + ", catalogue = " + item.pages);
    }

    const pdfName = item.id + ".pdf";
    copyFileSync(sourceFile, path.join(target, pdfName));
    pdfs[item.id] = "/assets/competences-ffme/" + pdfName;
    total += sourceBytes.length;
    manifest[item.id] = [];
    for (let page = 1; page <= pageCount; page++) {
      const filename = item.id + "-" + String(page).padStart(2, "0") + ".jpg";
      const destination = path.join(target, filename);
      const prefix = destination.slice(0, -4);
      const pixels = item.id === "comparatif" ? 4200 : 2800;
      run("pdftoppm", [
        "-f", String(page), "-l", String(page), "-singlefile",
        "-jpeg", "-jpegopt", "quality=85,optimize=y",
        "-scale-to", String(pixels),
        sourceFile, prefix,
      ]);
      const bytes = readFileSync(destination);
      if (bytes.length < 250 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
        throw new Error("Image JPEG invalide : " + filename);
      }
      manifest[item.id].push("/assets/competences-ffme/" + filename);
      total += bytes.length;
    }
    console.log(item.id + ": " + pageCount + " page(s), " + Math.round(total / 1024) + " KiB cumulés.");
  }
  const expectedFiles = [...Object.values(manifest).flat(), ...Object.values(pdfs)];
  const extraImages = readdirSync(target).filter((file) => /\.(jpg|pdf)$/i.test(file) && !expectedFiles.some((url) => url.endsWith("/" + file)));
  if (extraImages.length) throw new Error("Fichiers obsolètes à supprimer : " + extraImages.join(", "));
  writeFileSync(path.join(target, "manifest.json"), JSON.stringify({
    source: "Fédération française de la montagne et de l'escalade (FFME)",
    notice: "Reproduction autorisée déclarée par l'exploitant du club. Pages originales non retouchées.",
    documents: manifest,
    pdfs,
  }, null, 2) + "\n");
  console.log("Terminé : " + Object.values(manifest).flat().length + " images et " + Object.keys(pdfs).length + " PDF, " + (total / 1e6).toFixed(2) + " Mo.");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
