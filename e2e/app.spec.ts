import { expect, test } from "@playwright/test";

test("importe la démo et ouvre le lecteur 3D", async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));

  await page.goto("./");
  await expect(page.getByRole("heading", { name: /Reprenez de l’altitude/i })).toBeVisible();
  await page.getByRole("button", { name: /Explorer la trace de démonstration/i }).click();

  await expect(page.locator(".flight-viewer")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".cesium-widget canvas")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Lecture" })).toBeEnabled();
  await expect.poll(() => runtimeErrors).toEqual([]);
});

test("le lecteur avance et expose les vues caméra", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: /Explorer la trace de démonstration/i }).click();
  await expect(page.locator(".flight-viewer")).toBeVisible({ timeout: 15_000 });

  const timeline = page.getByRole("slider", { name: "Position dans le vol" });
  const before = Number(await timeline.inputValue());
  await page.getByRole("button", { name: "Lecture" }).click();
  await page.waitForTimeout(600);
  expect(Number(await timeline.inputValue())).toBeGreaterThan(before);

  await page.getByTitle("Pilote").click();
  await expect(page.getByTitle("Pilote")).toHaveClass(/is-active/);
  await page.getByTitle("Trace").click();
  await expect(page.getByTitle("Trace")).toHaveClass(/is-active/);
});

test("l’interface mobile conserve les commandes essentielles", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Scénario mobile uniquement");
  await page.goto("./");
  await page.getByRole("button", { name: /Explorer la trace de démonstration/i }).click();
  await expect(page.locator(".mobile-hud")).toBeVisible();
  await expect(page.locator(".altitude-tape")).toBeHidden();
  await expect(page.getByRole("button", { name: "Lecture" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Position dans le vol" })).toBeVisible();
});
