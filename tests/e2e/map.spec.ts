import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const runtimeErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
});

test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page) ?? []).toEqual([]);
});

async function ready(page: Page) {
  await page.goto("/nfl-talent-map");
  await expect(page.locator("[data-map-ready='true']")).toBeVisible();
}

test("default view reports the audited comparable-era coverage", async ({ page }) => {
  await ready(page);
  const coverage = page.getByRole("region", { name: "Current selection coverage" });
  await expect(coverage).toContainText("Eligible draft picks3,078");
  await expect(coverage).toContainText("Mapped in this view2,690");
  await expect(coverage).toContainText("Evidence coverage87.4%");
  await expect(coverage).toContainText("Not shown in this view388");
  await expect(page.getByText("2015–2026 comparable high-school era")).toBeAttached();
});

test("mixed-evidence mode updates coverage, warning, and shareable URL", async ({ page }) => {
  await ready(page);
  await page.getByLabel("Geography evidence").selectOption("all_mapped");
  await expect(page).toHaveURL(/geography=all_mapped/);
  const coverage = page.getByRole("region", { name: "Current selection coverage" });
  await expect(coverage).toContainText("Mapped in this view2,889");
  await expect(coverage).toContainText("Evidence coverage93.9%");
  await expect(page.getByText(/Mixed evidence: 2000–2014/)).toBeVisible();
});

test("year filters recalculate evidence coverage", async ({ page }) => {
  await ready(page);
  await page.getByLabel("Draft period").selectOption("2026");
  const coverage = page.getByRole("region", { name: "Current selection coverage" });
  await expect(coverage).toContainText("Eligible draft picks257");
  await expect(coverage).toContainText("Mapped in this view255");
  await expect(coverage).toContainText("Evidence coverage99.2%");
  await expect(coverage).toContainText("Not shown in this view2");
});

test("historical high-school view explains why the map is empty", async ({ page }) => {
  await ready(page);
  await page.getByLabel("Draft period").selectOption("2000-2014");
  await expect(page.getByText(/No pre-2015 selection has a promoted high-school county/)).toBeVisible();
  const coverage = page.getByRole("region", { name: "Current selection coverage" });
  await expect(coverage).toContainText("Evidence coverage0.0%");
  await expect(page.getByText("No mapped players match this filter combination.")).toBeVisible();
});

test("per-capita rankings enforce the five-player reliability rule", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: "Draftees per 100,000" }).click();
  await expect(page.getByText(/require at least 5 mapped draftees/)).toBeVisible();
  await expect(page.getByText("1–4 mapped (rate withheld)")).toBeVisible();
  await expect(page.locator(".ranking-list button")).toHaveCount(10);
  for (const button of await page.locator(".ranking-list button").all()) {
    await button.click();
    const count = Number((await page.locator(".county-detail-grid dd").first().innerText()).replaceAll(",", ""));
    expect(count).toBeGreaterThanOrEqual(5);
  }
});

test("county selector provides keyboard-accessible detail", async ({ page }) => {
  await ready(page);
  const selector = page.getByLabel("Inspect a mapped county");
  const firstValue = await selector.locator("option").nth(1).getAttribute("value");
  expect(firstValue).toBeTruthy();
  await selector.selectOption(firstValue!);
  await expect(page.getByText("County detail")).toBeVisible();
  await expect(page.getByRole("button", { name: "Close county detail" })).toBeVisible();
});

test("reset restores defaults and clears stale county detail", async ({ page }) => {
  await ready(page);
  await page.getByLabel("Draft period").selectOption("2025");
  const selector = page.getByLabel("Inspect a mapped county");
  const firstValue = await selector.locator("option").nth(1).getAttribute("value");
  await selector.selectOption(firstValue!);
  await expect(page.getByText("County detail")).toBeVisible();
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByLabel("Draft period")).toHaveValue("2015-2026");
  await expect(page.getByText("Select a county", { exact: true })).toBeVisible();
});

test("invalid URL state is safely normalized", async ({ page }) => {
  await page.goto("/nfl-talent-map?year=garbage&round=9&metric=hof&team=XYZ");
  await expect(page.locator("[data-map-ready='true']")).toBeVisible();
  await expect(page).toHaveURL(/\/nfl-talent-map$/);
  await expect(page.getByLabel("Draft period")).toHaveValue("2015-2026");
});

test("the product has no serious accessibility violations or horizontal overflow", async ({ page }) => {
  await ready(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const results = await new AxeBuilder({ page }).analyze();
  const material = results.violations.filter((violation) =>
    violation.impact === "serious" || violation.impact === "critical",
  );
  expect(material).toEqual([]);
});

test("mobile order presents the map before controls", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "mobile-only DOM-order assertion");
  await ready(page);
  const order = await page.locator(".workspace-grid > *").evaluateAll((nodes) =>
    nodes.map((node) => node.className),
  );
  expect(order).toEqual(["map-panel", "filter-panel", "ranking-panel"]);
});

test("poster routes render at their exact publication dimensions", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.startsWith("mobile"), "one exact-size check is sufficient");
  for (const poster of [
    { path: "/nfl-talent-map/reddit", width: 1080, height: 1350 },
    { path: "/nfl-talent-map/wide", width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize({ width: poster.width, height: poster.height });
    await page.goto(poster.path);
    const artifact = page.locator("[data-poster-ready='true']");
    await expect(artifact).toBeVisible();
    await expect(artifact).toContainText("2015–2026 VERIFIED HIGH SCHOOLS");
    await expect(artifact).toContainText("2,690");
    await expect(artifact).toContainText("verified HS locations");
    const box = await artifact.boundingBox();
    expect(box?.width).toBe(poster.width);
    expect(box?.height).toBe(poster.height);
  }
});
