import { detectCapabilities, type Capabilities } from "./capabilities";

// jsdom 26 implements none of the three APIs — no showModal, no showPopover, no
// CSS.supports. That is why `view` is a parameter: every "supported" branch below is
// reached by handing detectCapabilities a view that reports the API, and the real
// behaviour behind each one is proven in Chromium by the Playwright suite.
//
// The views here are fixtures, not mocks of a first-party module: they stand in for a
// browser, which is exactly what jsdom is already doing.

const view = (shape: Record<string, unknown>) => shape as unknown as Window;

describe("detectCapabilities", () => {
  it("reports nothing supported under jsdom, which implements none of the three", () => {
    expect(detectCapabilities(window)).toEqual<Capabilities>({
      topLayerDialog: false,
      popover: false,
      cssAnchor: false,
    });
  });

  it("detects a top-layer dialog", () => {
    const caps = detectCapabilities(view({ HTMLDialogElement: { prototype: { showModal: () => {} } } }));
    expect(caps.topLayerDialog).toBe(true);
    expect(caps.popover).toBe(false);
  });

  it("detects the Popover API", () => {
    const caps = detectCapabilities(view({ HTMLElement: { prototype: { showPopover: () => {} } } }));
    expect(caps.popover).toBe(true);
    expect(caps.topLayerDialog).toBe(false);
  });

  it("detects CSS anchor positioning, and takes only an exact yes for it", () => {
    expect(detectCapabilities(view({ CSS: { supports: () => true } })).cssAnchor).toBe(true);
    expect(detectCapabilities(view({ CSS: { supports: () => false } })).cssAnchor).toBe(false);
    // A browser that answers something truthy-but-not-true is not a browser that
    // supports it; the check is === true for that reason.
    expect(detectCapabilities(view({ CSS: { supports: () => "yes" } })).cssAnchor).toBe(false);
  });

  it("survives a view missing each constructor entirely", () => {
    expect(detectCapabilities(view({}))).toEqual<Capabilities>({
      topLayerDialog: false,
      popover: false,
      cssAnchor: false,
    });
    // Present but hollow: a prototype with no method, and a CSS object with no supports.
    expect(
      detectCapabilities(view({ HTMLDialogElement: { prototype: {} }, HTMLElement: {}, CSS: {} })),
    ).toEqual<Capabilities>({ topLayerDialog: false, popover: false, cssAnchor: false });
  });

  it("passes the anchor-name probe to CSS.supports rather than guessing from a UA string", () => {
    const seen: string[] = [];
    detectCapabilities(view({ CSS: { supports: (q: string) => (seen.push(q), true) } }));
    expect(seen).toEqual(["anchor-name: --probe"]);
  });
});
