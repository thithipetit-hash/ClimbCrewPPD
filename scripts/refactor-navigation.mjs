import fs from "node:fs";

const files = ["frontend/src/App.jsx", "frontend/src/AppCore.jsx"];

for (const file of files) {
  let source = fs.readFileSync(file, "utf8");

  if (!source.includes('import AppSidebar from "./components/AppSidebar.jsx";')) {
    source = source.replace(
      'import AuthPage from "./components/AuthPage.jsx";\n',
      'import AuthPage from "./components/AuthPage.jsx";\nimport AppSidebar from "./components/AppSidebar.jsx";\nimport MobileBottomNav from "./components/MobileBottomNav.jsx";\n'
    );
  }

  const sidebarPattern = /      \{sidebarOpen && <div className="sidebar-backdrop" onClick=\{\(\) => setSidebarOpen\(false\)\} \/>\}\n\n      <aside className=\{`sidebar \$\{sidebarOpen \? "open" : ""\}`\} aria-label="Navigation ClimbClubCristal">[\s\S]*?      <\/aside>\n/;
  if (!sidebarPattern.test(source)) {
    throw new Error(`Bloc sidebar introuvable dans ${file}`);
  }
  source = source.replace(sidebarPattern, `      <AppSidebar\n        open={sidebarOpen}\n        visibleTabs={visibleTabs}\n        activeTab={tab}\n        onSelectTab={setTab}\n        themePreference={themePreference}\n        onThemePreferenceChange={handleThemePreferenceChange}\n        authUser={authUser}\n        onLogout={handleLogout}\n        onClose={() => setSidebarOpen(false)}\n      />\n`);

  const mobilePattern = /      <nav className="mobile-bottom-nav" aria-label="Navigation mobile ClimbClubCristal">[\s\S]*?      <\/nav>\n/;
  if (!mobilePattern.test(source)) {
    throw new Error(`Bloc navigation mobile introuvable dans ${file}`);
  }
  source = source.replace(mobilePattern, `      <MobileBottomNav\n        visibleTabs={visibleTabs}\n        activeTab={tab}\n        onSelectTab={setTab}\n      />\n`);

  fs.writeFileSync(file, source);
}

fs.writeFileSync("VERSION", "20260829.028\n");
fs.rmSync("scripts/refactor-navigation.mjs");
fs.rmSync(".github/workflows/refactor-navigation-once.yml");
