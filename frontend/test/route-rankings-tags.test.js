import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("les statistiques proposent quatre classements de voies", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  for (const title of ["Voies les mieux notées", "Voies les plus réalisées", "Voies les plus réalisées en tête", "Mieux notées avec au moins 3 avis"]) {
    assert.match(source, new RegExp(title));
  }
});

test("le résumé statistique ne répète plus les compteurs de réalisations", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /className="label">Réalisations<\/div><div className="value"/);
  assert.doesNotMatch(source, /className="label">Réalisations en tête<\/div><div className="value"/);
});

test("les lignes sombres des classements utilisent un texte clair", async () => {
  const styles = await readFile(new URL("../src/climbcrew-enhancements.js", import.meta.url), "utf8");
  assert.match(styles, /\.route-ranking-row > span[\s\S]*color:#f8fafc!important/);
  assert.match(styles, /\.route-ranking-row > strong[\s\S]*color:#ffffff!important/);
  assert.match(styles, /\.app \.card \.lead-grade-row > span[\s\S]*-webkit-text-fill-color:#ffffff!important/);
});

test("les caractéristiques sont associées à la voie à sa création et à sa modification", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(source, /const ROUTE_TAGS =/);
  assert.match(source, /tags: newRoute\.tags/);
  assert.match(source, /tags: routeEditDraft\.tags/);
  assert.doesNotMatch(source, /newRealisation\.tags/);
  assert.match(source, /Caractéristiques :/);
  assert.match(source, /non renseignées/);
  assert.match(source, /className="route-characteristic"/);
  assert.match(source, /prev\.tags\.filter/);
  assert.match(source, /\.\.\.prev\.tags/);
  assert.match(source, /aria-pressed=\{selected\}/);
  assert.match(source, /newRoute\.tags\.length >= 3/);
  assert.match(source, /disabled=\{!selected && limitReached\}/);
});

test("la création d'une voie démarre vide et utilise une case moulinette", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(source, /numeroCorde: "",[\s\S]*couleurPrises: "",[\s\S]*cotationReference: ""/);
  assert.match(source, /type="checkbox" checked=\{newRoute\.moulinetteOnly\}/);
  assert.match(source, /newRoute\.tags\.length\}\/3 sélectionnées/);
  assert.match(source, /aria-hidden="true">✓/);
});
