import fs from "node:fs";

const files = ["frontend/src/App.jsx", "frontend/src/AppCore.jsx"];

for (const file of files) {
  let source = fs.readFileSync(file, "utf8");

  if (!source.includes('import AppSidebar from "./components/AppSidebar.jsx";')) {
    source = source.replace(
      'import AuthPage from "./components/AuthPage.jsx";',
      'import AuthPage from "./components/AuthPage.jsx";\nimport AppSidebar from "./components/AppSidebar.jsx";\nimport MobileBottomNav from "./components/MobileBottomNav.jsx";'
    );
  }

  const sidebarAnchor = source.indexOf('{sidebarOpen && <div className="sidebar-backdrop"');
  const pendingAnchor = source.indexOf('{pendingBroadcastMessages.length > 0 && (', sidebarAnchor);
  if (sidebarAnchor < 0 || pendingAnchor < 0) {
    throw new Error(`Repères sidebar introuvables dans ${file}: ${sidebarAnchor}/${pendingAnchor}`);
  }
  const sidebarLineStart = source.lastIndexOf('\n', sidebarAnchor) + 1;
  source = source.slice(0, sidebarLineStart) + `      <AppSidebar\n        open={sidebarOpen}\n        visibleTabs={visibleTabs}\n        activeTab={tab}\n        onSelectTab={setTab}\n        themePreference={themePreference}\n        onThemePreferenceChange={handleThemePreferenceChange}\n        authUser={authUser}\n        onLogout={handleLogout}\n        onClose={() => setSidebarOpen(false)}\n      />\n` + source.slice(source.lastIndexOf('\n', pendingAnchor) + 1);

  const mobileAnchor = source.indexOf('<nav className="mobile-bottom-nav"');
  const shellAnchor = source.indexOf('<div className="shell">', mobileAnchor);
  if (mobileAnchor < 0 || shellAnchor < 0) {
    throw new Error(`Repères navigation mobile introuvables dans ${file}: ${mobileAnchor}/${shellAnchor}`);
  }
  const mobileLineStart = source.lastIndexOf('\n', mobileAnchor) + 1;
  const shellLineStart = source.lastIndexOf('\n', shellAnchor) + 1;
  source = source.slice(0, mobileLineStart) + `      <MobileBottomNav\n        visibleTabs={visibleTabs}\n        activeTab={tab}\n        onSelectTab={setTab}\n      />\n\n` + source.slice(shellLineStart);

  fs.writeFileSync(file, source);
}

fs.writeFileSync("VERSION", "20260829.030\n");
fs.rmSync("scripts/refactor-navigation.mjs");
fs.rmSync(".github/workflows/refactor-navigation-once.yml");
