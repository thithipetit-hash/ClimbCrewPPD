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
