import fs from "node:fs";

const files = ["frontend/src/App.jsx", "frontend/src/AppCore.jsx"];

for (const file of files) {
  let source = fs.readFileSync(file, "utf8");

  if (!source.includes('AppSidebar from')) {
    source = source.replace(
      'import AuthPage from "./components/AuthPage.jsx";',
      'import AuthPage from "./components/AuthPage.jsx";\nimport AppSidebar from "./components/AppSidebar.jsx";\nimport MobileBottomNav from "./components/MobileBottomNav.jsx";'
    );
  }

  const sidebarToken = source.indexOf('sidebar-backdrop');
  const pendingAnchor = source.indexOf('pendingBroadcastMessages.length > 0', sidebarToken);
  if (sidebarToken < 0 || pendingAnchor < 0) {
    throw new Error(`Repères sidebar introuvables dans ${file}: ${sidebarToken}/${pendingAnchor}`);
  }
  const sidebarLineStart = source.lastIndexOf('\n', source.lastIndexOf('\n', sidebarToken) - 1) + 1;
  const pendingLineStart = source.lastIndexOf('\n', pendingAnchor) + 1;
  source = source.slice(0, sidebarLineStart) + `      <AppSidebar\n        open={sidebarOpen}\n        visibleTabs={visibleTabs}\n        activeTab={tab}\n        onSelectTab={setTab}\n        themePreference={themePreference}\n        onThemePreferenceChange={handleThemePreferenceChange}\n        authUser={authUser}\n        onLogout={handleLogout}\n        onClose={() => setSidebarOpen(false)}\n      />\n` + source.slice(pendingLineStart);

  const mobileToken = source.indexOf('mobile-bottom-nav');
  const shellToken = source.indexOf('className="shell"', mobileToken);
  if (mobileToken < 0 || shellToken < 0) {
    throw new Error(`Repères navigation mobile introuvables dans ${file}: ${mobileToken}/${shellToken}`);
  }
  const mobileLineStart = source.lastIndexOf('\n', mobileToken) + 1;
  const shellLineStart = source.lastIndexOf('\n', shellToken) + 1;
  source = source.slice(0, mobileLineStart) + `      <MobileBottomNav\n        visibleTabs={visibleTabs}\n        activeTab={tab}\n        onSelectTab={setTab}\n      />\n\n` + source.slice(shellLineStart);

  fs.writeFileSync(file, source);
}

fs.writeFileSync("VERSION", "20260829.031\n");
fs.rmSync("scripts/refactor-navigation.mjs");
fs.rmSync(".github/workflows/refactor-navigation-once.yml");
