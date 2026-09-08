import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../src/styles/ui-density.css", import.meta.url), "utf8");
const main = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");

test("l'échelle typographique compacte est centralisée", () => {
  assert.match(css, /--cc-font-body:14px/);
  assert.match(css, /--cc-font-h1:20px/);
  assert.match(css, /--cc-control-height:34px/);
  assert.match(css, /@media \(max-width:700px\)/);
  assert.match(main, /styles\/ui-density\.css/);
});
