import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const page = fs.readFileSync(new URL("../src/pages/DonneesUtilisateurs.jsx", import.meta.url), "utf8");
const main = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../src/styles/user-data-mobile.css", import.meta.url), "utf8");

test("les données utilisateurs passent en cartes sur petit écran", () => {
  assert.match(page, /className="card user-data-page"/);
  assert.match(page, /user-data-mobile-controls/);
  assert.match(page, /user-data-mobile-list/);
  assert.match(page, /user-data-mobile-card/);
  assert.match(page, /user-data-desktop-table/);
  assert.match(main, /user-data-mobile\.css/);
  assert.match(css, /@media \(max-width: 700px\)/);
  assert.match(css, /\.user-data-page \.user-data-desktop-table[\s\S]*display:\s*none/);
  assert.match(css, /\.user-data-mobile-list[\s\S]*display:\s*grid/);
});

test("la vue mobile conserve édition, filtres et actions", () => {
  assert.match(page, /filterEditor\(key, label\)/);
  assert.match(page, /USER_DATA_COLUMNS\.map/);
  assert.match(page, /Supprimer cet utilisateur/);
  assert.match(page, /Enregistrement…/);
  assert.match(css, /\.user-data-mobile-field\.is-boolean/);
  assert.match(css, /input\[type="checkbox"\]/);
});
