import fs from "node:fs";

const files = ["frontend/src/App.jsx", "frontend/src/AppCore.jsx"];

function replaceBlock(source, startMarker, endMarker, replacement, label, file) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`${label} début introuvable dans ${file}`);
  const endStart = source.indexOf(endMarker, start);
  if (endStart < 0) throw new Error(`${label} fin introuvable dans ${file}`);
  const end = endStart + endMarker.length;
  return source.slice(0, start) + replacement + source.slice(end);
}

for (const file of files) {
  let source = fs.readFileSync(file, "utf8");

  if (!source.includes('import AppSidebar from "./components/AppSidebar.jsx";')) {
    source = source.replace(
      'import AuthPage from "./components/AuthPage.jsx";\n',
      'import AuthPage from "./components/AuthPage.jsx";\nimport AppSidebar from "./components/AppSidebar.jsx";\nimport MobileBottomNav from "./components/MobileBottomNav.jsx";\n'
    );
  }

  source = replaceBlock(
    source,
    '      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}\n\n      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`} aria-label="Navigation ClimbClubCristal">',
    '      </aside>\n',
    `      <AppSidebar\n        open={sidebarOpen}\n        visibleTabs={visibleTabs}\n        activeTab={tab}\n        onSelectTab={setTab}\n        themePreference={themePreference}\n        onThemePreferenceChange={handleThemePreferenceChange}\n        authUser={authUser}\n        onLogout={handleLogout}\n        onClose={() => setSidebarOpen(false)}\n      />\n`,
    "Bloc sidebar",
    file
  );

  source = replaceBlock(
    source,
    '      <nav className="mobile-bottom-nav" aria-label="Navigation mobile ClimbClubCristal">',
    '      </nav>\n',
    `      <MobileBottomNav\n        visibleTabs={visibleTabs}\n        activeTab={tab}\n        onSelectTab={setTab}\n      />\n`,
    "Navigation mobile",
    file
  );

  fs.writeFileSync(file, source);
}

fs.writeFileSync("VERSION", "20260829.029\n");
fs.rmSync("scripts/refactor-navigation.mjs");
fs.rmSync(".github/workflows/refactor-navigation-once.yml");
