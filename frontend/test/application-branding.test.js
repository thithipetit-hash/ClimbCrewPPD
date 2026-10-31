import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const visibleSurfaces = [
  "../index.html",
  "../public/site.webmanifest",
  "../public/rgpd.html",
  "../src/App.jsx",
  "../src/components/AppSidebar.jsx",
  "../src/components/AuthPage.jsx",
  "../src/sections/FaqSection.jsx",
];

test("les pages et l'application installable utilisent le nom CristalClimbClub", () => {
  for (const path of visibleSurfaces) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /CristalClimbClub/, path);
    assert.doesNotMatch(source, /CristalClimbCrew|\bClimbCrew\b/, path);
  }
});
