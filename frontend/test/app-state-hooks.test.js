import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

test("App délègue ses états transverses et éditeurs à des hooks dédiés", () => {
  for (const hook of [
    "useAppUiState", "useAuthState", "useParticipantEditorState",
    "useRouteEditorState", "useRealisationEditorState",
  ]) {
    assert.match(app, new RegExp(hook));
  }
  assert.doesNotMatch(app, /useState\(/);
});

test("les hooks de domaine restent séparés du composant racine", () => {
  for (const file of [
    "useAppUiState.js", "useAuthState.js", "useParticipantEditorState.js",
    "useRouteEditorState.js", "useRealisationEditorState.js",
  ]) {
    const source = fs.readFileSync(new URL("../src/hooks/" + file, import.meta.url), "utf8");
    assert.match(source, /useState/);
    assert.doesNotMatch(source, /function App\(/);
  }
});
