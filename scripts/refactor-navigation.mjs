import fs from "node:fs";

const file = "frontend/src/AppCore.jsx";
let source = fs.readFileSync(file, "utf8");

if (!source.includes('AppSidebar from')) {
  source = source.replace(
    'import AuthPage from "./components/AuthPage.jsx";',
    'import AuthPage from "./components/AuthPage.jsx";\nimport AppSidebar from "./components/AppSidebar.jsx";\nimport MobileBottomNav from "./components/MobileBottomNav.jsx";'
  );
}

const pendingAnchor = source.indexOf('pendingBroadcastMessages.length > 0');
const asideAnchor = source.lastIndexOf('<aside', pendingAnchor);
if (asideAnchor < 0 || pendingAnchor < 0) {
  throw new Error(`Repères aside introuvables: ${asideAnchor}/${pendingAnchor}`);
}
const asideLineStart = source.lastIndexOf('\n', asideAnchor) + 1;
const pendingLineStart = source.lastIndexOf('\n', pendingAnchor) + 1;
source = source.slice(0, asideLineStart) + `      <AppSidebar\n        open={sidebarOpen}\n        visibleTabs={visibleTabs}\n        activeTab={tab}\n        onSelectTab={setTab}\n        themePreference={themePreference}\n        onThemePreferenceChange={handleThemePreferenceChange}\n        authUser={authUser}\n        onLogout={handleLogout}\n        onClose={() => setSidebarOpen(false)}\n      />\n` + source.slice(pendingLineStart);

const shellToken = source.indexOf('className="shell"');
const navAnchor = source.lastIndexOf('<nav', shellToken);
if (navAnchor < 0 || shellToken < 0) {
  throw new Error(`Repères navigation mobile introuvables: ${navAnchor}/${shellToken}`);
}
const navLineStart = source.lastIndexOf('\n', navAnchor) + 1;
const shellLineStart = source.lastIndexOf('\n', shellToken) + 1;
source = source.slice(0, navLineStart) + `      <MobileBottomNav\n        visibleTabs={visibleTabs}\n        activeTab={tab}\n        onSelectTab={setTab}\n      />\n\n` + source.slice(shellLineStart);

fs.writeFileSync(file, source);
fs.writeFileSync("VERSION", "20260829.033\n");
fs.rmSync("scripts/refactor-navigation.mjs");
fs.rmSync(".github/workflows/refactor-navigation-once.yml");
