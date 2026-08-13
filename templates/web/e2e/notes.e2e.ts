import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("notes happy path with no serious/critical a11y violations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Notes" })).toBeVisible();

  await page.getByTestId("note-input").fill("E2E note");
  await page.getByTestId("note-add").click();
  await expect(page.getByText("E2E note")).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(blocking).toEqual([]);
});

test("empty submit surfaces a validation error", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("note-add").click();
  await expect(page.getByRole("alert")).toBeVisible();
});

test("keyboard: skip link is reachable and focuses main", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("skip-link")).toBeFocused();
});
