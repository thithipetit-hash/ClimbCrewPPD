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
  await page.goto("/competences/hors-ligne", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/Bibliothèque préparée pour une consultation sans réseau/i)).toBeVisible({ timeout: 20_000 });
  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Compétences · Atlas FFME/i })).toBeVisible();
    await expect(page.locator(".competence-resource")).toHaveCount(12);
    await page.getByRole("button", { name: "Lire la fiche intégrée" }).last().click();
    await expect(page.getByText("Développer l'observation et l'anticipation")).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});
