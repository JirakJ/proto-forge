import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Shell-level guarantees that survive every generation run: deep links resolve,
// unknown URLs land on a real page, and that page is accessible.
test("a deep link to an unknown URL renders the not-found page, not a blank shell", async ({ page }) => {
  await page.goto("/no-such-page");
  await expect(page.getByTestId("not-found")).toBeVisible();
  await expect(page.getByRole("main")).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(blocking).toEqual([]);
});

test("the not-found page navigates back home without a full reload", async ({ page }) => {
  await page.goto("/no-such-page");
  await page.getByTestId("not-found-home").click();
  await expect(page).toHaveURL("/");
  await expect(page.getByTestId("not-found")).toHaveCount(0);
});
