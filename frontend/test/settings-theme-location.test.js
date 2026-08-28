import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { moveThemeSettingsOutOfSidebar } from "../scripts/app-source-adjustments.mjs";

const here = dirname(fileURLToPath(import.meta.url));

test("l'ambiance est dans Paramètres et l'e-mail n'est plus affiché dans le menu", async () => {
  const appSource = await readFile(resolve(here, "../src/App.jsx"), "utf8");
  const transformed = moveThemeSettingsOutOfSidebar(appSource);
  const settingsSource = await readFile(resolve(here, "../src/pages/Parametres.jsx"), "utf8");

  assert.doesNotMatch(transformed, /className="sidebar-theme"/);
  assert.doesNotMatch(transformed, /className="sidebar-account"[\s\S]*?authUser\.email/);
  assert.match(transformed, /themePreference=\{themePreference\}/);
  assert.match(transformed, /onThemePreferenceChange=\{handleThemePreferenceChange\}/);
  assert.match(transformed, /themeOptions=\{THEME_OPTIONS\}/);
  assert.match(settingsSource, /htmlFor="settings-theme-selector">Ambiance<\/label>/);
  assert.match(settingsSource, /themeOptions\.map/);
});
