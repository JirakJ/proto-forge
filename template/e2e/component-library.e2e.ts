import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { cases, type Case } from "../src/harness/cases";
import {
  collectErrors,
  exceedsClippingAncestor,
  focusedTestid,
  hasVisibleFocusRing,
  isTopmost,
  tabOrder,
} from "./support/overlay";

// @adr 009 - the component-library suite is GENERATED from the case registry
//
// One loop, one contract, every component. Adding a case to src/harness/cases.ts adds
// its tests here with no further work, and overlay:matrix fails if a component exists
// with no case — so a primitive cannot ship without browser coverage, and the suite
// cannot drift from the catalogue because they are the same data.
//
// Per case, unconditionally: mounts clean (no console error, no page error), passes axe
// with zero serious/critical violations, and every focusable stop shows a visible focus
// ring. Per declared assert: topmost (five-point hit test), notClipped, focusOrder,
// focusReturnsTo. The asserts live in the registry rather than here so that docs:shots
// photographs exactly the states the tests exercise.

const renderable = cases.filter((c) => c.kind !== "structural");

async function mount(page: import("@playwright/test").Page, c: Case) {
  await page.goto(`/harness.html#/${c.id}`);
  await page.getByTestId("harness-case").waitFor({ state: "visible" });
  for (const id of c.interactions?.click ?? []) await page.getByTestId(id).click();
  for (const key of c.interactions?.press ?? []) await page.keyboard.press(key);
}

for (const c of renderable) {
  test.describe(c.id, () => {
    test("mounts clean and passes axe with zero serious or critical violations", async ({ page }) => {
      const errors = collectErrors(page);
      await mount(page, c);

      test.skip(c.axe?.skip !== undefined, c.axe?.skip ?? "");
      const { violations } = await new AxeBuilder({ page }).analyze();
      const blocking = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(
        blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
      ).toEqual([]);
      expect(errors()).toEqual([]);
    });

    test("every reachable focus stop shows a visible focus indicator", async ({ page }) => {
      await mount(page, c);
      const stops = await tabOrder(page, 12);
      for (const id of stops) {
        expect(await hasVisibleFocusRing(page, id), `${id} gives no visible sign of focus`).toBe(true);
      }
    });

    if (c.assert?.topmost !== undefined) {
      const target = c.assert.topmost;
      test(`the surface wins the hit test at its centre and corners (${target})`, async ({ page }) => {
        await mount(page, c);
        await page.getByTestId(target).waitFor({ state: "visible" });
        expect(await isTopmost(page, target)).toBe(true);
      });
    }

    if (c.assert?.notClipped !== undefined) {
      const target = c.assert.notClipped;
      test(`the surface escapes its clipping ancestor (${target})`, async ({ page }) => {
        await mount(page, c);
        expect(await exceedsClippingAncestor(page, target)).toBe(true);
      });
    }

    if (c.assert?.focusOrder !== undefined) {
      const order = c.assert.focusOrder;
      test("Tab visits the declared stops in order", async ({ page }) => {
        await mount(page, c);
        const visited = await tabOrder(page, order.length + 4);
        expect(visited.filter((id) => order.includes(id))).toEqual([...order]);
      });
    }

    if (c.assert?.focusReturnsTo !== undefined) {
      const home = c.assert.focusReturnsTo;
      test(`Escape returns focus to ${home}`, async ({ page }) => {
        await mount(page, c);
        await page.keyboard.press("Escape");
        expect(await focusedTestid(page)).toBe(home);
      });
    }
  });
}
