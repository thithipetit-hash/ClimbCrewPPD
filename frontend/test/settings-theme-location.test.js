import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

test("l'ambiance est dans Paramètres et l'e-mail n'est plus affiché dans le menu", async () => {
  const [appSource, sidebarSource, settingsSource] = await Promise.all([
    readFile(resolve(here, "../src/App.jsx"), "utf8"),
    readFile(resolve(here, "../src/components/AppSidebar.jsx"), "utf8"),
    readFile(resolve(here, "../src/pages/Parametres.jsx"), "utf8"),
  ]);

  assert.doesNotMatch(appSource, /className="sidebar-theme"/);
  assert.doesNotMatch(sidebarSource, /className="sidebar-theme"/);
  assert.doesNotMatch(sidebarSource, /className="sidebar-account"[\s\S]*?authUser\.email/);
  assert.match(appSource, /themePreference=\{themePreference\}/);
  assert.match(appSource, /onThemePreferenceChange=\{handleThemePreferenceChange\}/);
  assert.match(appSource, /themeOptions=\{THEME_OPTIONS\}/);
  assert.match(settingsSource, /htmlFor="settings-theme-selector">Ambiance<\/label>/);
  assert.match(settingsSource, /themeOptions\.map/);
});
