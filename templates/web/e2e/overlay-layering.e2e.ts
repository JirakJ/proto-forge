import { test, expect } from "@playwright/test";
import { exceedsClippingAncestor, focusedTestid, isTopmost } from "./support/overlay";

// @adr 008 - the layering guarantee, asserted against a real browser, for STACKS
//
// jsdom has no layout, no paint, no top layer and no inertness, so every question here
// is one only Chromium can answer — and two of this file's cases exist because a browser
// refuted the first design (showModal's inertness killed every surface above the modal)
// while every unit test stayed green.
//
// Sixteen numbered cases, mirroring the spec's adversarial matrix. The single-overlay
// cases (1, 2, 6, 7, 11) are inherited from the original suite; the stack cases are what
// the old per-kind scale could not express, and the accessibility-mode cases assert the
// surfaces survive forced-colors and reduced-motion. The harness supplies every fixture;
// it is a separate entry point built only when VITE_HARNESS=1 and never ships.

test("1 — a modal escapes an ancestor stacking context and is not clipped by it", async ({ page }) => {
  await page.goto("/harness.html#/dialog-stacking-trap");
  const dialog = page.getByTestId("harness-trapped-dialog");
  await expect(dialog).toBeVisible();

  // The ancestor is 80px tall with overflow:hidden. Rendered in place, the dialog would
  // be cropped to it; in the top layer it is free of it entirely.
  const dialogBox = (await dialog.boundingBox())!;
  const trapBox = (await page.getByTestId("harness-trap").boundingBox())!;
  expect(dialogBox.height).toBeGreaterThan(trapBox.height);
  expect(await exceedsClippingAncestor(page, "harness-trapped-dialog")).toBe(true);
  expect(await isTopmost(page, "harness-trapped-dialog")).toBe(true);
});

test("2 — a sticky header does not paint over the modal or its backdrop", async ({ page }) => {
  await page.goto("/harness.html#/dialog-stacking-trap");
  await expect(page.getByTestId("harness-trapped-dialog")).toBeVisible();

  const coveredByHeader = await page.evaluate(() => {
    const header = document.querySelector('[data-testid="harness-trap-header"]')!;
    const r = header.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return header.contains(hit);
  });
  expect(coveredByHeader).toBe(false);
});

test("3 — a sibling at z-index 2147483647 still loses to the modal", async ({ page }) => {
  // The largest z-index CSS accepts, held by ordinary app code. Any scale-based overlay
  // loses this by arithmetic (the old scale topped out at 1300); a top-layer surface is
  // not part of the document's stacking contexts, so the contest does not happen.
  await page.goto("/harness.html#/dialog-hostile-z");
  await expect(page.getByTestId("harness-hostile-dialog")).toBeVisible();
  expect(await isTopmost(page, "harness-hostile-dialog")).toBe(true);
});

test("4 — dialog over dialog: B paints above A, and Escape closes only B", async ({ page }) => {
  await page.goto("/harness.html#/dialog-over-dialog");
  await page.getByTestId("harness-open-b").click();
  await expect(page.getByTestId("harness-dialog-b")).toBeVisible();

  expect(await isTopmost(page, "harness-dialog-b")).toBe(true);

  // One Escape, one dialog: the topmost. A stays open and A stays modal.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("harness-dialog-b")).toBeHidden();
  await expect(page.getByTestId("harness-dialog-a")).toBeVisible();
  expect(await isTopmost(page, "harness-dialog-a")).toBe(true);

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("harness-dialog-a")).toBeHidden();
});

test("5 — a menu belonging to dialog A stays under a dialog B opened later", async ({ page }) => {
  // The case a per-kind scale cannot express: with popover ranked above modal globally,
  // this menu would outrank dialog B forever, and no offset arithmetic repairs it.
  await page.goto("/harness.html#/dialog-menu-then-dialog");
  await page.getByTestId("harness-mtd-menu-trigger").click();
  await expect(page.getByTestId("harness-mtd-menu-surface")).toBeVisible();
  expect(await isTopmost(page, "harness-mtd-menu-surface")).toBe(true);

  await page.getByTestId("harness-mtd-open-b").click();
  await expect(page.getByTestId("harness-mtd-dialog-b")).toBeVisible();
  expect(await isTopmost(page, "harness-mtd-dialog-b")).toBe(true);
  expect(await isTopmost(page, "harness-mtd-menu-surface")).toBe(false);
});

test("6 — a menu opened inside a modal draws above it", async ({ page }) => {
  await page.goto("/harness.html#/dialog-with-menu");
  await page.getByTestId("harness-dialog-menu-trigger").click();
  const surface = page.getByTestId("harness-dialog-menu-surface");
  await expect(surface).toBeVisible();
  expect(await isTopmost(page, "harness-dialog-menu-surface")).toBe(true);
});

test("7 — a toast raised from inside a modal is still on top", async ({ page }) => {
  await page.goto("/harness.html#/toast-over-modal");
  await page.getByTestId("harness-toast-fire").click();
  const region = page.getByTestId("toast-region");
  await expect(region).toBeVisible();
  await expect(region.locator("[data-testid^='toast-t']").first()).toBeVisible();
  expect(await isTopmost(page, "toast-region")).toBe(true);
});

test("8 — a tooltip asked for after a toast paints above the toast", async ({ page }) => {
  // Order is what the user did, not what the kinds are: toast first, tooltip second.
  await page.goto("/harness.html#/tooltip-over-toast");
  await page.getByTestId("harness-tot-fire").click();
  await expect(page.getByTestId("toast-region").locator("[data-testid^='toast-t']").first()).toBeVisible();

  await page.getByTestId("harness-tot-control").click(); // click focuses; focus shows the tooltip
  await expect(page.getByTestId("harness-tot-tip-surface")).toBeVisible();
  expect(await isTopmost(page, "harness-tot-tip-surface")).toBe(true);
});

test("9 — a modal escapes contain:paint, content-visibility and a filter ancestor", async ({ page }) => {
  await page.goto("/harness.html#/dialog-paint-contained");
  const dialog = page.getByTestId("harness-contained-dialog");
  await expect(dialog).toBeVisible();
  expect(await exceedsClippingAncestor(page, "harness-contained-dialog")).toBe(true);
  expect(await isTopmost(page, "harness-contained-dialog")).toBe(true);
});

test("10 — a menu in a scroll container escapes the clip and re-anchors on scroll", async ({ page }) => {
  await page.goto("/harness.html#/menu-in-scroller");
  await page.getByTestId("harness-scroller-menu-trigger").click();
  const surface = page.getByTestId("harness-scroller-menu-surface");
  await expect(surface).toBeVisible();
  expect(await exceedsClippingAncestor(page, "harness-scroller-menu-surface")).toBe(true);

  const before = (await surface.boundingBox())!;
  const trigger = (await page.getByTestId("harness-scroller-menu-trigger").boundingBox())!;
  // Below the trigger before the scroll — anchored, not merely somewhere on screen.
  expect(Math.abs(before.y - (trigger.y + trigger.height))).toBeLessThan(24);

  await page.getByTestId("harness-scroller").evaluate((el) => {
    el.scrollTop = 60;
    // A programmatic scrollTop change fires the event asynchronously; dispatching makes
    // the re-anchor deterministic instead of racing the assertion.
    el.dispatchEvent(new Event("scroll", { bubbles: false }));
  });
  const movedTrigger = (await page.getByTestId("harness-scroller-menu-trigger").boundingBox())!;
  const after = (await surface.boundingBox())!;
  expect(Math.abs(after.y - (movedTrigger.y + movedTrigger.height))).toBeLessThan(24);
  expect(after.y).not.toBe(before.y);
});

test("11 — every overlay shares one body-level host, and it is the last child of body", async ({ page }) => {
  await page.goto("/harness.html#/dialog-with-menu");
  await page.getByTestId("harness-dialog-menu-trigger").click();

  expect(await page.locator("#proto-ui-overlay-root").count()).toBe(1);
  expect(await page.evaluate(() => document.body.lastElementChild?.id === "proto-ui-overlay-root")).toBe(true);
});

test("12 — the scroll lock is refcounted: closing one of two modals keeps the page held", async ({ page }) => {
  await page.goto("/harness.html#/dialog-over-dialog");
  const overflow = () => page.evaluate(() => document.documentElement.style.overflow);

  await page.getByTestId("harness-open-b").click();
  expect(await overflow()).toBe("hidden");

  await page.keyboard.press("Escape"); // closes B; A still blocks the page
  await expect(page.getByTestId("harness-dialog-b")).toBeHidden();
  expect(await overflow()).toBe("hidden");

  await page.keyboard.press("Escape"); // closes A; the page is released
  await expect(page.getByTestId("harness-dialog-a")).toBeHidden();
  expect(await overflow()).toBe("");
});

test("13 — focus returns through the stack, not past it", async ({ page }) => {
  await page.goto("/harness.html#/dialog-over-dialog");
  await page.getByTestId("harness-open-b").click();
  await expect(page.getByTestId("harness-dialog-b")).toBeVisible();

  // Closing B lands focus back on the control inside A that opened it — not on the page.
  await page.keyboard.press("Escape");
  expect(await focusedTestid(page)).toBe("harness-open-b");
});

test("14 — the page behind a modal is inert to both the pointer and the keyboard", async ({ page }) => {
  await page.goto("/harness.html#/dialog-inert-background");
  await expect(page.getByTestId("harness-inert-dialog")).toBeVisible();

  // The pointer: a forced click on the counter button must not increment it. `force`
  // bypasses Playwright's own actionability refusal, so what is measured is the page's
  // inertness rather than the test runner's politeness.
  await page.getByTestId("harness-behind-button").click({ force: true, timeout: 2000 }).catch(() => {});
  expect(await page.getByTestId("harness-behind-count").textContent()).toBe("0");

  // The keyboard: Tab cycles without ever landing behind the dialog.
  const seen = new Set<string>();
  for (let i = 0; i < 8; i += 1) {
    await page.keyboard.press("Tab");
    const id = await focusedTestid(page);
    if (id !== null) seen.add(id);
  }
  expect([...seen]).not.toContain("harness-behind-button");
});

test.describe("15 — forced colors", () => {
  test("the modal surface and its heading stay visible", async ({ page }) => {
    // Emulated per page: forcedColors is a media emulation, not a test option in this
    // Playwright version.
    await page.emulateMedia({ forcedColors: "active" });
    await page.goto("/harness.html#/dialog-open");
    const dialog = page.getByTestId("harness-dialog");
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId("harness-dialog-title")).toBeVisible();

    // Forced-colors overrides author colors; what must survive is that the surface
    // resolves to SOME non-transparent paint, not any particular value.
    const paint = await dialog.evaluate((el) => {
      const s = getComputedStyle(el);
      return { background: s.backgroundColor, color: s.color };
    });
    expect(paint.background).not.toBe("rgba(0, 0, 0, 0)");
    expect(paint.color).not.toBe("rgba(0, 0, 0, 0)");
    expect(await isTopmost(page, "harness-dialog")).toBe(true);
  });
});

test.describe("16 — reduced motion", () => {
  test("no transition stands between opening a surface and asserting on it", async ({ page }) => {
    // reducedMotion is a media emulation, not a test option in this Playwright version.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/harness.html#/menu-open");
    await page.getByTestId("harness-menu-trigger").click();
    const surface = page.getByTestId("harness-menu-surface");
    await expect(surface).toBeVisible();

    // The library ships no overlay transitions at all — waiting is where flake lives —
    // so under reduced motion nothing changes and the surface is immediately correct.
    const transition = await surface.evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(transition).toBe("0s");
    expect(await isTopmost(page, "harness-menu-surface")).toBe(true);
  });
});

test("no rendered page ships a duplicate data-testid", async ({ page }) => {
  await page.goto("/");
  const duplicates = await page.evaluate(() => {
    const ids = [...document.querySelectorAll("[data-testid]")].map((el) => el.getAttribute("data-testid")!);
    return [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  });
  expect(duplicates).toEqual([]);
});
