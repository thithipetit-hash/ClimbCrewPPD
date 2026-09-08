import { expect, test } from "@playwright/test";

async function dismissStartupVideo(page) {
  const skipButton = page.getByRole("button", { name: "Passer" });
  if (await skipButton.isVisible().catch(() => false)) {
    await skipButton.click();
  }
  await expect(page.locator(".startup-video")).toHaveCount(0, { timeout: 5_000 });
}

function shortElementName(element) {
  const id = element.id ? `#${element.id}` : "";
  const classes = typeof element.className === "string" && element.className.trim()
    ? `.${element.className.trim().split(/\s+/).slice(0, 3).join(".")}`
    : "";
  return `${element.tagName.toLowerCase()}${id}${classes}`;
}

test("la vidéo d'introduction libère une application déjà chargée", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/", { waitUntil: "domcontentloaded" });

  const intro = page.locator(".startup-video");
  const app = page.locator(".startup-video-app");
  const skipButton = page.getByRole("button", { name: "Passer" });

  await expect(intro).toBeVisible();
  await expect(skipButton).toBeVisible();
  await expect(app).toHaveCount(1);
  await expect(app).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("body")).toHaveClass(/startup-video-active/);

  const appStateDuringIntro = await app.evaluate((element) => ({
    inert: element.inert,
    childCount: element.querySelectorAll("*").length,
    textLength: (element.textContent || "").trim().length,
  }));

  expect(appStateDuringIntro.inert, "L'application doit rester non interactive pendant l'intro").toBe(true);
  expect(
    appStateDuringIntro.childCount,
    "L'application doit déjà être montée et chargée derrière la vidéo"
  ).toBeGreaterThan(0);
  expect(
    appStateDuringIntro.textLength,
    "L'application montée derrière la vidéo doit déjà contenir son interface"
  ).toBeGreaterThan(0);

  await skipButton.click();
  await expect(intro).toHaveClass(/startup-video--leaving/);
  await expect(intro).toHaveCount(0, { timeout: 2_000 });
  await expect(app).not.toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("body")).not.toHaveClass(/startup-video-active/);

  await expect.poll(async () => app.evaluate((element) => element.inert)).toBe(false);
  await expect(page.locator("#root")).toBeVisible();

  const interactiveCount = await page.locator("button, a, input, select, textarea").count();
  expect(
    interactiveCount,
    "Une fois l'intro terminée, l'application doit exposer au moins un contrôle interactif"
  ).toBeGreaterThan(0);

  expect(pageErrors, `Erreurs JavaScript pendant la transition: ${pageErrors.join(" | ")}`).toEqual([]);
});

test("l'application tient dans la largeur d'un écran Android", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#root")).toBeVisible();
  await dismissStartupVideo(page);

  await page.waitForTimeout(250);

  const layout = await page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const documentWidth = Math.max(
      document.documentElement.scrollWidth,
      document.body?.scrollWidth || 0
    );

    const offenders = [...document.querySelectorAll("body *")]
      .filter((element) => {
        const style = window.getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden") return false;
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        return rect.left < -1 || rect.right > viewportWidth + 1;
      })
      .slice(0, 12)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const id = element.id ? `#${element.id}` : "";
        const classes = typeof element.className === "string" && element.className.trim()
          ? `.${element.className.trim().split(/\s+/).slice(0, 3).join(".")}`
          : "";
        return {
          element: `${element.tagName.toLowerCase()}${id}${classes}`,
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        };
      });

    return { viewportWidth, documentWidth, offenders };
  });

  expect(pageErrors, `Erreurs JavaScript navigateur: ${pageErrors.join(" | ")}`).toEqual([]);
  expect(
    layout.documentWidth,
    `Débordement horizontal: document=${layout.documentWidth}px, viewport=${layout.viewportWidth}px. Éléments suspects: ${JSON.stringify(layout.offenders)}`
  ).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(
    layout.offenders,
    `Éléments sortant de l'écran: ${JSON.stringify(layout.offenders)}`
  ).toEqual([]);
});

test("les contrôles interactifs visibles restent accessibles", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await dismissStartupVideo(page);

  const inaccessible = await page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    return [...document.querySelectorAll("button, a, input, select, textarea")]
      .filter((element) => {
        const style = window.getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden") return false;
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        return rect.right <= 0 || rect.left >= viewportWidth;
      })
      .slice(0, 12)
      .map((element) => ({
        element: (() => {
          const id = element.id ? `#${element.id}` : "";
          const classes = typeof element.className === "string" && element.className.trim()
            ? `.${element.className.trim().split(/\s+/).slice(0, 3).join(".")}`
            : "";
          return `${element.tagName.toLowerCase()}${id}${classes}`;
        })(),
        text: (element.textContent || element.getAttribute("aria-label") || "").trim().slice(0, 80),
      }));
  });

  expect(inaccessible, `Contrôles hors écran: ${JSON.stringify(inaccessible)}`).toEqual([]);
});
