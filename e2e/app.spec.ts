import AxeBuilder from "@axe-core/playwright";
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
  const pilotView = page.getByRole("region", { name: /Vue pilote orientable/ });
  await pilotView.focus();
  await pilotView.press("ArrowRight");
  await pilotView.press("Home");
  await expect(page.getByRole("button", { name: /Recentrer la vue pilote/ })).toBeVisible();
  await page.getByRole("button", { name: /Recentrer la vue pilote/ }).click();
  await page.getByTitle("Trace").click();
  await expect(page.getByTitle("Trace")).toHaveClass(/is-active/);
});

test("la bibliothèque permet de renommer et supprimer avec confirmation", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: /Explorer la trace de démonstration/i }).click();
  await expect(page.locator(".flight-viewer")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Retour à la bibliothèque" }).click();

  await page.getByRole("button", { name: /Renommer Tracé/i }).click();
  const name = page.getByRole("textbox", { name: /Nouveau nom/i });
  await name.fill("Tour de piste");
  await name.press("Enter");
  await expect(page.getByText("Tour de piste")).toBeVisible();

  await page.getByRole("button", { name: "Supprimer Tour de piste" }).click();
  await expect(page.getByRole("alertdialog", { name: /Confirmer la suppression/i })).toBeVisible();
  await page.getByRole("button", { name: "Annuler" }).click();
  await expect(page.getByText("Tour de piste")).toBeVisible();
  await page.getByRole("button", { name: "Supprimer Tour de piste" }).click();
  await page.getByRole("button", { name: "Supprimer", exact: true }).click();
  await expect(page.getByText("Aucun vol enregistré")).toBeVisible();
});

test("l’offset d’altitude est appliqué et persisté par vol", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: /Explorer la trace de démonstration/i }).click();
  await expect(page.locator(".flight-viewer")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Instruments avancés" }).click();
  const offset = page.getByRole("spinbutton", { name: "Offset d’altitude" });
  await offset.fill("25");
  await page.getByRole("combobox", { name: "Modèle d’appareil" }).selectOption("paramotor");
  await expect(offset).toHaveValue("25");
  await expect(page.getByRole("button", { name: /valeur actuelle \+25 m/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Coller ce point au sol" })).toBeVisible();

  await page.reload();
  await expect(page.locator(".flight-open")).toBeVisible();
  await page.locator(".flight-open").click();
  await page.getByRole("button", { name: "Instruments avancés" }).click();
  await expect(page.getByRole("spinbutton", { name: "Offset d’altitude" })).toHaveValue("25");
  await expect(page.getByRole("combobox", { name: "Modèle d’appareil" })).toHaveValue("paramotor");
  await expect(page.getByRole("checkbox", { name: /Bâtiments OpenStreetMap/ })).toBeVisible();
});

test("les libellés des courbes ne se chevauchent pas", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: /Explorer la trace de démonstration/i }).click();
  await expect(page.locator(".chart-label")).toHaveCount(3);

  const rows = await page.locator(".chart-label").evaluateAll((labels) =>
    labels.map((label) =>
      Array.from(label.children).map((child) => {
        const bounds = child.getBoundingClientRect();
        return { top: bounds.top, bottom: bounds.bottom };
      }),
    ),
  );
  for (const [title, maximum, minimum] of rows) {
    expect(title.bottom).toBeLessThanOrEqual(maximum.top + 0.5);
    expect(maximum.bottom).toBeLessThanOrEqual(minimum.top + 0.5);
  }
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

test("les écrans principaux respectent les règles WCAG automatisables", async ({ page }) => {
  await page.goto("./");
  const landing = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(landing.violations, JSON.stringify(landing.violations, null, 2)).toEqual([]);

  await page.getByRole("button", { name: /Explorer la trace de démonstration/i }).click();
  await expect(page.locator(".flight-viewer")).toBeVisible({ timeout: 15_000 });
  const viewer = await new AxeBuilder({ page })
    .exclude(".cesium-widget-credits")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(viewer.violations, JSON.stringify(viewer.violations, null, 2)).toEqual([]);
});

test("le globe se replie sans les services ArcGIS", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Scénario réseau exécuté une seule fois");
  let osmRequests = 0;
  await page.route("**/World_Imagery/**", (route) => route.abort());
  await page.route("**/WorldElevation3D/**", (route) => route.abort());
  page.on("request", (request) => {
    if (request.url().includes("tile.openstreetmap.org")) osmRequests += 1;
  });

  await page.goto("./");
  await page.getByRole("button", { name: /Explorer la trace de démonstration/i }).click();
  await expect(page.locator(".flight-viewer")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Mode de secours")).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => osmRequests, { timeout: 15_000 }).toBeGreaterThan(0);
});
