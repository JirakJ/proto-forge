import { promote, demote, isPromoted } from "./topLayer";
import type { Capabilities } from "./capabilities";

// jsdom implements no top-layer API at all, so the platform methods are defined on
// real elements per test. That is a stand-in for a browser, not a mock of our own
// code: the element, its attributes and its selector matching are jsdom's, and only
// the two or three methods jsdom lacks are supplied. Chromium proves the real thing
// in e2e/overlay-layering.e2e.ts.

const CAPABLE: Capabilities = { topLayerDialog: false, popover: true, cssAnchor: false };
const INCAPABLE: Capabilities = { topLayerDialog: false, popover: false, cssAnchor: false };

/** A surface with the Popover API, including a :popover-open that answers honestly. */
function elementWithPopover() {
  const el = document.createElement("div");
  const calls: string[] = [];
  let shown = false;
  Object.defineProperties(el, {
    showPopover: {
      value: () => {
        calls.push("showPopover");
        shown = true;
      },
      configurable: true,
    },
    hidePopover: {
      value: () => {
        calls.push("hidePopover");
        shown = false;
      },
      configurable: true,
    },
    // jsdom throws on :popover-open, so the selector it cannot parse is answered here.
    matches: { value: (sel: string) => (sel === ":popover-open" ? shown : false), configurable: true },
  });
  document.body.append(el);
  return { el, calls };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("promote / demote", () => {
  it("sets popover=manual before showing, because showPopover throws without the attribute", () => {
    const { el, calls } = elementWithPopover();
    promote(el, CAPABLE);
    // Manual, never auto: an auto popover light-dismisses without telling React, so the
    // DOM and the component's state would diverge and the surface could not reopen.
    expect(el.getAttribute("popover")).toBe("manual");
    expect(calls).toEqual(["showPopover"]);
    expect(isPromoted(el, CAPABLE)).toBe(true);

    demote(el, CAPABLE);
    expect(calls).toEqual(["showPopover", "hidePopover"]);
    expect(isPromoted(el, CAPABLE)).toBe(false);
  });

  it("leaves an author-set popover attribute alone", () => {
    const { el } = elementWithPopover();
    el.setAttribute("popover", "manual");
    promote(el, CAPABLE);
    expect(el.getAttribute("popover")).toBe("manual");
  });

  it("is a no-op without the Popover API, and reports not promoted", () => {
    const { el, calls } = elementWithPopover();
    promote(el, INCAPABLE);
    demote(el, INCAPABLE);
    expect(calls).toEqual([]);
    expect(el.getAttribute("popover")).toBeNull();
    // Asked without the capability, isPromoted answers false without touching
    // :popover-open — which jsdom cannot parse at all.
    expect(isPromoted(el, INCAPABLE)).toBe(false);
  });

  it("is a no-op on an element the platform gave no popover methods", () => {
    const el = document.createElement("div");
    document.body.append(el);
    expect(() => promote(el, CAPABLE)).not.toThrow();
    expect(() => demote(el, CAPABLE)).not.toThrow();
  });
});
