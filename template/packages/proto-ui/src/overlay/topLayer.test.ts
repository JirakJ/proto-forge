import { promote, demote, isPromoted, type PromoteMode } from "./topLayer";
import type { Capabilities } from "./capabilities";

// jsdom implements no top-layer API at all, so the platform methods are defined on
// real elements per test. That is a stand-in for a browser, not a mock of our own
// code: the element, its attributes and its selector matching are jsdom's, and only
// the two or three methods jsdom lacks are supplied. Chromium proves the real thing
// in e2e/overlay-layering.e2e.ts.

const CAPABLE: Capabilities = { topLayerDialog: true, popover: true, cssAnchor: false };
const INCAPABLE: Capabilities = { topLayerDialog: false, popover: false, cssAnchor: false };

/** A <dialog> with the top-layer methods a real browser would already have. */
function dialogWithTopLayer() {
  const el = document.createElement("dialog");
  const calls: string[] = [];
  Object.defineProperties(el, {
    open: { value: false, writable: true, configurable: true },
    showModal: {
      value: () => {
        calls.push("showModal");
        (el as { open?: boolean }).open = true;
      },
      configurable: true,
    },
    close: {
      value: () => {
        calls.push("close");
        (el as { open?: boolean }).open = false;
      },
      configurable: true,
    },
  });
  document.body.append(el);
  return { el, calls };
}

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

describe("promote / demote — modal", () => {
  it("puts a dialog in the top layer and takes it back out", () => {
    const { el, calls } = dialogWithTopLayer();
    promote(el, "modal", CAPABLE);
    expect(calls).toEqual(["showModal"]);
    expect(isPromoted(el, "modal", CAPABLE)).toBe(true);

    demote(el, "modal", CAPABLE);
    expect(calls).toEqual(["showModal", "close"]);
    expect(isPromoted(el, "modal", CAPABLE)).toBe(false);
  });

  it("is idempotent: promoting an open dialog does not call showModal again", () => {
    const { el, calls } = dialogWithTopLayer();
    promote(el, "modal", CAPABLE);
    promote(el, "modal", CAPABLE);
    expect(calls).toEqual(["showModal"]);
  });

  it("does not close a dialog that is not open", () => {
    const { el, calls } = dialogWithTopLayer();
    demote(el, "modal", CAPABLE);
    expect(calls).toEqual([]);
  });

  it("is a no-op when the platform has no top layer — the caller falls back instead", () => {
    const { el, calls } = dialogWithTopLayer();
    promote(el, "modal", INCAPABLE);
    demote(el, "modal", INCAPABLE);
    expect(calls).toEqual([]);
    expect(isPromoted(el, "modal", INCAPABLE)).toBe(false);
  });

  it("is a no-op on an element that is not a dialog, even when capabilities say yes", () => {
    const el = document.createElement("div");
    document.body.append(el);
    expect(() => promote(el, "modal", CAPABLE)).not.toThrow();
    expect(() => demote(el, "modal", CAPABLE)).not.toThrow();
    expect(isPromoted(el, "modal", CAPABLE)).toBe(false);
  });
});

describe("promote / demote — popover and hint", () => {
  it.each<[PromoteMode, string]>([
    ["popover", "auto"],
    ["hint", "hint"],
  ])("sets the %s attribute before showing, because showPopover throws without it", (mode, attr) => {
    const { el, calls } = elementWithPopover();
    promote(el, mode, CAPABLE);
    expect(el.getAttribute("popover")).toBe(attr);
    expect(calls).toEqual(["showPopover"]);
    expect(isPromoted(el, mode, CAPABLE)).toBe(true);

    demote(el, mode, CAPABLE);
    expect(calls).toEqual(["showPopover", "hidePopover"]);
    expect(isPromoted(el, mode, CAPABLE)).toBe(false);
  });

  it("leaves an author-set popover attribute alone", () => {
    const { el } = elementWithPopover();
    el.setAttribute("popover", "manual");
    promote(el, "popover", CAPABLE);
    expect(el.getAttribute("popover")).toBe("manual");
  });

  it("is a no-op without the Popover API, and reports not promoted", () => {
    const { el, calls } = elementWithPopover();
    promote(el, "popover", INCAPABLE);
    demote(el, "popover", INCAPABLE);
    expect(calls).toEqual([]);
    expect(el.getAttribute("popover")).toBeNull();
    // Asked without the capability, isPromoted answers false without touching
    // :popover-open — which jsdom cannot parse at all.
    expect(isPromoted(el, "popover", INCAPABLE)).toBe(false);
  });

  it("is a no-op on an element the platform gave no popover methods", () => {
    const el = document.createElement("div");
    document.body.append(el);
    expect(() => promote(el, "popover", CAPABLE)).not.toThrow();
    expect(() => demote(el, "popover", CAPABLE)).not.toThrow();
  });
});
