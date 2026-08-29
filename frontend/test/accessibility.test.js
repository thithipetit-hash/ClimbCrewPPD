import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("les commandes composées d'une icône possèdent un libellé accessible", async () => {
  // La navigation jour/semaine précédent-suivant vit désormais dans Inscriptions.jsx,
  // et le tri des statistiques dans StatisticsSection.jsx (App.jsx ne rend plus ce JSX).
  const inscriptions = await readFile(new URL("../src/pages/Inscriptions.jsx", import.meta.url), "utf8");
  const statistics = await readFile(new URL("../src/sections/StatisticsSection.jsx", import.meta.url), "utf8");

  assert.match(inscriptions, /aria-label=\{viewMode[^\n]+jour précédent/);
  assert.match(inscriptions, /aria-label=\{viewMode[^\n]+jour suivant/);
  assert.match(statistics, /aria-label=\{statsSortDirection[^\n]+ordre décroissant/);
});

test("le clavier et les zones tactiles disposent de styles accessibles", async () => {
  const source = await readFile(
    new URL("../src/climbcrew-enhancements-legacy.js", import.meta.url),
    "utf8",
  );

  assert.match(source, /:focus-visible/);
  assert.match(source, /min-width:44px/);
  assert.match(source, /min-height:44px/);
  assert.match(source, /prefers-contrast:more/);
});

test("la liste des inscrits devient multicolonne sans couper les noms sur plusieurs lignes", async () => {
  const styles = await readFile(new URL("../src/climbcrew-enhancements-legacy.js", import.meta.url), "utf8");
  assert.match(styles, /@media \(min-width:720px\)[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(styles, /@media \(min-width:1100px\)[\s\S]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(styles, /@media \(min-width:1500px\)[\s\S]*grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(styles, /\.session-participant-list \.participant-name[\s\S]*white-space:nowrap!important/);
  assert.match(styles, /\.app \.session-card-compact \.session-participant-list[\s\S]*grid-template-columns:minmax\(0,1fr\)!important/);
});

test("les pages administratives sont placées après la FAQ", async () => {
  // Le test vérifie l'ordre à partir des clés stables, indépendamment du libellé affiché.
  const source = await readFile(new URL("../src/lib/ui-config.js", import.meta.url), "utf8");
  const faq = source.indexOf('key: "faq"');
  const administration = source.indexOf('key: "administration"');
  const accounts = source.indexOf('key: "gestion_comptes"');
  const logs = source.indexOf('key: "logs"');
  assert.ok(faq >= 0 && administration >= 0 && accounts >= 0 && logs >= 0);
  assert.ok(faq < administration && administration < accounts && accounts < logs);
});
