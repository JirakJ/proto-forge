import type { Page } from "@playwright/test";

// @adr 008 - the layering guarantee, asked as questions a browser can answer
// jsdom has no layout and no paint, so a unit test can assert a zIndex value but never
// that an element is actually on top. These helpers ask Chromium the only questions
// that matter: what would a click here hit, does this box escape its clipper, where
// does Tab go, and can a person see where focus is.

/**
 * True when the element is painted on top — it wins `elementFromPoint` at its centre
 * AND at four points inset from its corners. The predecessor probed only the centre,
 * which passes for a surface half-covered by a sibling; five probes make "on top" mean
 * the whole surface, not its midpoint.
 *
 * A surface with `pointer-events: none` (a tooltip, by contract — it must never block
 * the control it describes) is invisible to hit testing by design, which would make
 * this oracle report "not on top" about the one property the tooltip gets right. For
 * the measurement only, hit-testability is switched on and restored: the question
 * becomes "IF this could be hit, would it be?", which is exactly paint order.
 */
export async function isTopmost(page: Page, testid: string): Promise<boolean> {
  return page.evaluate((id) => {
    const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    if (el === null) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;

    const passthrough = getComputedStyle(el).pointerEvents === "none";
    const previous = el.style.pointerEvents;
    if (passthrough) el.style.pointerEvents = "auto";
    try {
      const inset = Math.min(4, r.width / 4, r.height / 4);
      const probes: [number, number][] = [
        [r.x + r.width / 2, r.y + r.height / 2],
        [r.x + inset, r.y + inset],
        [r.right - inset, r.y + inset],
        [r.x + inset, r.bottom - inset],
        [r.right - inset, r.bottom - inset],
      ];
      return probes.every(([x, y]) => {
        const hit = document.elementFromPoint(x, y);
        return hit !== null && el.contains(hit);
      });
    } finally {
      if (passthrough) el.style.pointerEvents = previous;
    }
  }, testid);
}

/**
 * True when the element's box escapes its nearest clipping ancestor — the property an
 * `overflow: hidden` parent destroys for an in-place surface.
 */
export async function exceedsClippingAncestor(page: Page, testid: string): Promise<boolean> {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    if (el === null) return false;
    let ancestor = el.parentElement;
    while (ancestor !== null && ancestor !== document.body) {
      const overflow = getComputedStyle(ancestor).overflow;
      if (overflow !== "visible") {
        const box = el.getBoundingClientRect();
        const clip = ancestor.getBoundingClientRect();
        return box.top < clip.top || box.bottom > clip.bottom || box.left < clip.left || box.right > clip.right;
      }
      ancestor = ancestor.parentElement;
    }
    // No clipping ancestor at all — a portalled surface, which is the strongest escape.
    return true;
  }, testid);
}

/** The testids Tab visits, in order, up to `count` stops or until focus stops moving. */
export async function tabOrder(page: Page, count: number): Promise<string[]> {
  const visited: string[] = [];
  for (let i = 0; i < count; i += 1) {
    await page.keyboard.press("Tab");
    const id = await focusedTestid(page);
    if (id === null) break;
    if (visited.length > 0 && visited[visited.length - 1] === id) break;
    visited.push(id);
  }
  return visited;
}

/** The data-testid of the currently focused element, or null when focus is on the body. */
export async function focusedTestid(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (active === null || active === document.body) return null;
    return active.getAttribute("data-testid");
  });
}

/**
 * True when focus is VISIBLE on the element: its focused outline or box-shadow differs
 * from its blurred one. Computed styles, not pixels — deterministic across machines.
 */
export async function hasVisibleFocusRing(page: Page, testid: string): Promise<boolean> {
  return page.evaluate((id) => {
    const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    if (el === null) return false;
    const read = () => {
      const s = getComputedStyle(el);
      return `${s.outlineWidth} ${s.outlineStyle} ${s.outlineColor} | ${s.boxShadow} | ${s.borderColor}`;
    };
    el.focus();
    const focused = read();
    el.blur();
    const blurred = read();
    el.focus();
    return focused !== blurred;
  }, testid);
}

/**
 * Collects console errors and page errors from `page`'s creation onward. Call before
 * navigation; assert `errors()` is empty at the end of the test.
 */
export function collectErrors(page: Page): () => string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return () => errors;
}
