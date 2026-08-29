import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("la modification d'une voie n'envoie que les champs éditables", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");

  assert.match(source, /const routePatch = \{/);
  assert.match(source, /body: JSON\.stringify\(routePatch\)/);
  assert.doesNotMatch(source, /body: JSON\.stringify\(updatedRoute\)/);
});

test("une erreur de modification est affichée dans la carte de la voie", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const voies = await readFile(new URL("../src/pages/Voies.jsx", import.meta.url), "utf8");

  assert.match(source, /setRouteError\(""\);/);
  assert.match(voies, /routeError && <div className="error" style=\{\{ marginTop: 8 \}\}>\{routeError\}<\/div>/);
});

test("une liste de réalisations peut être entièrement déployée ou repliée", async () => {
  const source = await readFile(new URL("../src/pages/Progression.jsx", import.meta.url), "utf8");

  assert.match(source, /progressViewRealisations\.length > 1/);
  assert.match(source, /allProgressRealisationsExpanded \? "Tout replier" : "Tout déployer"/);
  assert.match(source, /open=\{expandedRealisationIds\.includes\(realisation\.id\)\}/);
  assert.match(source, /aria-expanded=\{allProgressRealisationsExpanded\}/);
});

test("le graphique CPR reste dans la largeur mobile et la suppression est compacte", async () => {
  const source = await readFile(new URL("../src/pages/Progression.jsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/climbcrew-enhancements-legacy.js", import.meta.url), "utf8");

  assert.match(source, /variant="danger" className="realisation-delete-button"/);
  assert.match(styles, /\.cpr-chart \{[^}]*max-width:100%[^}]*min-width:0/s);
  assert.match(styles, /\.realisation-delete-button \{[^}]*font-size:13px!important/s);
});
