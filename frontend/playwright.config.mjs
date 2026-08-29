import { defineConfig } from "@playwright/test";

const androidProjects = [
  { name: "android-small", viewport: { width: 360, height: 800 }, deviceScaleFactor: 3 },
  { name: "android-standard", viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625 },
  { name: "android-large", viewport: { width: 480, height: 854 }, deviceScaleFactor: 2.25 },
];

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    isMobile: true,
    hasTouch: true,
    locale: "fr-FR",
    colorScheme: "light",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: androidProjects.map((project) => ({
    name: project.name,
    use: {
      viewport: project.viewport,
      deviceScaleFactor: project.deviceScaleFactor,
    },
  })),
  webServer: {
    command: "npm run preview -- --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
