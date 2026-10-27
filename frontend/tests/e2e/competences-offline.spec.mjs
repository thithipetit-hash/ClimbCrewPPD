import { expect, test } from "@playwright/test";

test("la bibliothèque autonome ouvre les fiches sans API ni lecteur externe", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/competences/hors-ligne", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /Compétences · Atlas FFME/i })).toBeVisible();
  await expect(page.locator(".competence-resource")).toHaveCount(12);
  await expect(page.locator(".competences-original-preview img")).toHaveCount(12);
  await expect(page.locator("iframe, object")).toHaveCount(0);

  await page.getByRole("button", { name: "Lire la fiche intégrée" }).first().click();
  await expect(page.getByText("Préparer un départ en vérifiant mutuellement")).toBeVisible();
  await expect(page.locator(".competences-original-figure")).toHaveCount(2);
  await page.getByRole("button", { name: /Agrandir la page 1 du document Contrôle croisé/ }).click();
  await expect(page.getByRole("dialog", { name: "Agrandir une illustration FFME" })).toBeVisible();
  await expect(page.getByRole("dialog").locator("img")).toHaveJSProperty("complete", true);
  await page.getByRole("button", { name: "Fermer" }).click();
  await expect(page.locator(".competences-local-media video")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("une fois préparée, la bibliothèque reste consultable sans réseau", async ({ page, context }) => {
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
  expect(cached.keys.filter((key) => key.startsWith("/assets/competences-ffme/") && key.endsWith(".jpg")).length).toBe(27);
  await context.setOffline(true);
  try {
    await page.goto("/competences/hors-ligne", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /ClimbCrew · Bibliothèque de compétences/i })).toBeVisible();
    await expect(page.locator(".competence-resource")).toHaveCount(12);
    await page.locator("summary").last().click();
    await expect(page.locator(".ffme-page img")).toHaveCount(8);
    const officialPage = page.locator(".ffme-page img").first();
    await officialPage.scrollIntoViewIfNeeded();
    await expect.poll(() => officialPage.evaluate((img) => img.naturalWidth)).toBeGreaterThan(100);
    await expect(page.getByText("Développer l'observation et l'anticipation")).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});
