import { expect, test } from "@playwright/test";

test("la bibliothèque autonome ouvre les fiches sans API ni lecteur externe", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/competences/hors-ligne", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /Compétences · Atlas FFME/i })).toBeVisible();
  await expect(page.locator(".competence-resource")).toHaveCount(12);
  await expect(page.locator(".competences-illustration")).toHaveCount(12);
  await expect(page.locator("iframe, object")).toHaveCount(0);

  await page.getByRole("button", { name: "Lire la fiche intégrée" }).first().click();
  await expect(page.getByText("Préparer un départ en vérifiant mutuellement")).toBeVisible();
  await expect(page.locator(".competences-local-media video")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("une fois préparée, la bibliothèque reste consultable sans réseau", async ({ page, context }) => {
  const failures = [];
  page.on("requestfailed", (req) => failures.push([req.url(), req.failure()?.errorText]));
  page.on("pageerror", (err) => failures.push(["JS", err.message]));
  await page.goto("/competences/hors-ligne", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/Bibliothèque préparée pour une consultation sans réseau/i)).toBeVisible({ timeout: 20_000 });
  const cached = await page.evaluate(async () => {
    const names = (await caches.keys()).filter((name) => name.startsWith("climbcrew-competences-shell-"));
    const shell = await caches.open(names[0]);
    const keys = (await shell.keys()).map((request) => new URL(request.url).pathname);
    return { controlled: Boolean(navigator.serviceWorker.controller), keys };
  });
  expect(cached.controlled, "Le navigateur doit être contrôlé avant le passage hors-ligne").toBe(true);
  expect(cached.keys).toContain("/");
  expect(cached.keys.filter((key) => key.startsWith("/assets/")).length).toBeGreaterThan(0);
  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    const diagnostics = await page.evaluate(async () => ({
      title: document.title,
      snippet: document.body?.innerText?.slice(0, 500),
      rootHtml: document.getElementById("root")?.innerHTML?.slice(0, 350),
      controlled: Boolean(navigator.serviceWorker.controller),
      assets: [...performance.getEntriesByType("resource")].slice(-10).map((x) => x.name),
    }));
    console.log("OFFLINE_BROWSER_DIAGNOSTIC", JSON.stringify({ diagnostics, failures }));
    await expect(page.getByRole("heading", { name: /Compétences · Atlas FFME/i })).toBeVisible();
    await expect(page.locator(".competence-resource")).toHaveCount(12);
    await page.getByRole("button", { name: "Lire la fiche intégrée" }).last().click();
    await expect(page.getByText("Développer l'observation et l'anticipation")).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});
