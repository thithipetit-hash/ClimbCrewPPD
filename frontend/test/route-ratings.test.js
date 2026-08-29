import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("la note de une à cinq étoiles est saisie avec la réalisation", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const voies = await readFile(new URL("../src/pages/Voies.jsx", import.meta.url), "utf8");

  assert.match(source, /\[1, 2, 3, 4, 5\]\.map/);
  assert.match(source, /role="radiogroup"/);
  assert.match(source, /newRealisation\.rating/);
  assert.match(source, /rating <= newRealisation\.rating/);
  assert.match(source, /\? "★" : "☆"/);
  assert.match(source, /routeRatingsById/);
  assert.match(voies, /routeRating\.average\.toFixed\(1\)/);
  assert.match(voies, /Pas encore notée \(0 réalisation\)/);
});

test("les étoiles sélectionnées sont affichées en jaune", async () => {
  const styles = await readFile(new URL("../src/styles/climbcrew-enhancements.css", import.meta.url), "utf8");
  assert.match(styles, /\.rating-stars \.rating-star\.selected/);
  assert.match(styles, /color:#facc15!important/);
  assert.match(styles, /not\(\.remove-button\)/);
  assert.match(styles, /not\(\.rating-star\)/);
});
