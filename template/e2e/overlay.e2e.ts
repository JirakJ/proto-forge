import { test, expect, type Page } from "@playwright/test";

// @adr 008 - the layering guarantee, asserted against a real browser
// jsdom has no layout and no paint, so a unit test can assert a zIndex value but
// never that an element is actually on top. These run against the built app in
// Chromium and ask the only question that matters: at the centre of this popup,
// what does the browser say the user would click?
//
// The gallery supplies the adversarial page. It is a fixture, not shipped UI —
// gallery.html is a separate entry point built only when VITE_GALLERY=1.

/** True when the element is what a click at its own centre would actually hit. */
async function isTopmost(page: Page, testid: string) {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    if (el === null) return false;
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return hit !== null && el.contains(hit);
  }, testid);
}

test("a modal escapes an ancestor stacking context and is not clipped by it", async ({ page }) => {
  await page.goto("/gallery.html#/dialog-stacking-trap");

  const dialog = page.getByTestId("gallery-trapped-dialog");
  await expect(dialog).toBeVisible();

  // The ancestor is 80px tall with overflow:hidden. Rendered in place, the dialog
  // would be cropped to it; portalled, it is free of it entirely.
  const dialogBox = (await dialog.boundingBox())!;
  const trapBox = (await page.getByTestId("gallery-trap").boundingBox())!;
  expect(dialogBox.height).toBeGreaterThan(trapBox.height);

  // The ancestor also carries transform + filter, both of which create a stacking
  // context that traps every descendant z-index. Paint order proves the escape.
  expect(await isTopmost(page, "gallery-trapped-dialog")).toBe(true);
});

test("a sticky header does not paint over the modal scrim", async ({ page }) => {
  await page.goto("/gallery.html#/dialog-stacking-trap");
  await expect(page.getByTestId("gallery-trapped-dialog")).toBeVisible();

  const coveredByHeader = await page.evaluate(() => {
    const header = document.querySelector('[data-testid="gallery-trap-header"]')!;
    const r = header.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return header.contains(hit);
  });
  expect(coveredByHeader).toBe(false);
});

test("a menu opened inside a modal draws above it", async ({ page }) => {
  await page.goto("/gallery.html#/dialog-with-menu");
  await page.getByTestId("gallery-dialog-menu-trigger").click();

  const surface = page.getByTestId("gallery-dialog-menu-surface");
  await expect(surface).toBeVisible();
  expect(await isTopmost(page, "gallery-dialog-menu-surface")).toBe(true);
});

test("a toast raised from inside a modal is still on top", async ({ page }) => {
  await page.goto("/gallery.html#/toast-over-modal");
  await page.getByTestId("gallery-toast-fire").click();

  const region = page.getByTestId("toast-region");
  await expect(region).toBeVisible();
  const toast = region.locator("[data-testid^='toast-t']").first();
  await expect(toast).toBeVisible();

  const onTop = await page.evaluate(() => {
    const el = document.querySelector("[data-testid^='toast-t']");
    if (el === null) return false;
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return hit !== null && el.contains(hit);
  });
  expect(onTop).toBe(true);
});

test("every overlay shares one body-level host, and it is the last child of body", async ({ page }) => {
  await page.goto("/gallery.html#/dialog-with-menu");
  await page.getByTestId("gallery-dialog-menu-trigger").click();

  const hosts = await page.locator("#proto-ui-overlay-root").count();
  expect(hosts).toBe(1);

  const isLast = await page.evaluate(
    () => document.body.lastElementChild?.id === "proto-ui-overlay-root",
  );
  expect(isLast).toBe(true);
});

test("no rendered page ships a duplicate data-testid", async ({ page }) => {
  await page.goto("/");
  const duplicates = await page.evaluate(() => {
    const ids = [...document.querySelectorAll("[data-testid]")].map((el) => el.getAttribute("data-testid")!);
    return [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  });
  expect(duplicates).toEqual([]);
});
