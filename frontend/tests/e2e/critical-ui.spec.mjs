import { expect, test } from "@playwright/test";

test("la création de compte expose des contrôles utilisables sur Android", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: /création d.un compte/i })).toBeVisible();
  await page.getByRole("button", { name: /création d.un compte/i }).click();
  await expect(page.getByLabel("Prénom", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Nom", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
});

test("aucun dialogue navigateur natif n'est déclenché sur l'écran d'accès", async ({ page }) => {
  let dialogs = 0;
  page.on("dialog", async (dialog) => {
    dialogs += 1;
    await dialog.dismiss();
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(250);
  expect(dialogs).toBe(0);
});
