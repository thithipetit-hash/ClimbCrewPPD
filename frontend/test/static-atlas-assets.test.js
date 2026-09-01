import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const atlasDir = path.resolve("src/assets");
const publicRoot = path.resolve("public");
const atlasFiles = fs.readdirSync(atlasDir).filter((name) => name.endsWith("-atlas.js")).sort();

test("les atlas référencent des fichiers statiques sans Base64 embarqué", () => {
  assert.ok(atlasFiles.length > 0, "aucun atlas trouvé");

  for (const fileName of atlasFiles) {
    const source = fs.readFileSync(path.join(atlasDir, fileName), "utf8");
    assert.equal(source.includes(";base64,"), false, `${fileName} contient encore du Base64`);

    const urls = [...source.matchAll(/["'](\/assets\/atlases\/[^"']+)["']/g)].map((match) => match[1]);
    assert.ok(urls.length > 0, `${fileName} ne référence aucun asset statique`);

    for (const url of urls) {
      const staticPath = path.join(publicRoot, url.replace(/^\//, ""));
      assert.ok(fs.existsSync(staticPath), `${url} est absent du dossier public`);

      if (staticPath.endsWith(".webp")) {
        const bytes = fs.readFileSync(staticPath);
        assert.ok(bytes.length > 12, `${url} est vide ou tronqué`);
        assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF", `${url} n'est pas un WebP RIFF valide`);
        assert.equal(bytes.subarray(8, 12).toString("ascii"), "WEBP", `${url} n'est pas un WebP valide`);
      }
    }
  }
});
