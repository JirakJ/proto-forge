import { cases, type Case } from "./cases";
import { mounts } from "./mounts";
import { OVERLAY_KINDS } from "@jj/proto-ui";

// The registry is split — pure data in cases.ts, JSX in mounts.tsx — so Playwright can
// enumerate tests at collection time without pulling React into the Node process. A
// split invites drift, so this suite is the inner half of the parity guarantee;
// overlay:matrix repeats it from outside the test runner, where it also survives
// someone deleting this file.

const renderable = cases.filter((c) => c.kind !== "structural");

/** Every testid a case points at, whichever field it points from. */
const referencedTestids = (c: Case): string[] =>
  [
    ...(c.interactions?.click ?? []),
    ...(c.assert?.focusOrder ?? []),
    c.assert?.topmost,
    c.assert?.notClipped,
    c.assert?.focusReturnsTo,
  ].filter((v): v is string => v !== undefined);
const structural = cases.filter((c) => c.kind === "structural");

describe("harness registry parity", () => {
  it("gives every renderable case a mount, and every mount a case", () => {
    const caseIds = renderable.map((c) => c.id).sort();
    const mountIds = Object.keys(mounts).sort();
    expect(mountIds).toEqual(caseIds);
  });

  it("gives no structural case a mount — there is nothing to render", () => {
    for (const c of structural) expect(mounts[c.id]).toBeUndefined();
  });

  it("keeps ids unique and kebab-case, because they are URL fragments and test names", () => {
    const ids = cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9-]+$/);
      expect(id).not.toMatch(/^-|-$|--/);
    }
  });

  it("classifies every case with a kind the matrix understands", () => {
    for (const c of cases) expect(["surface", "visual", "structural"]).toContain(c.kind);
  });

  it("requires every surface component to prove it wins a hit test", () => {
    const surfaceComponents = new Set(cases.filter((c) => c.kind === "surface").map((c) => c.component));
    for (const component of surfaceComponents) {
      const proves = cases.some((c) => c.component === component && c.assert?.topmost !== undefined);
      expect(proves, `${component} declares no case with assert.topmost`).toBe(true);
    }
  });

  it("covers every overlay kind with at least one surface case", () => {
    // OVERLAY_KINDS exists as a value for exactly this check: a kind in the type but in
    // nobody's harness is the gap the registry exists to close. The mapping from
    // component to kind is by what each component claims in useOverlaySlot.
    const byKind = new Map<(typeof OVERLAY_KINDS)[number], string>([
      ["modal", "Dialog"],
      ["popover", "Menu"],
      ["toast", "ToastProvider"],
      ["tooltip", "Tooltip"],
    ]);
    for (const kind of OVERLAY_KINDS) {
      const component = byKind.get(kind)!;
      expect(
        cases.some((c) => c.component === component && c.kind === "surface"),
        `no surface case exercises the "${kind}" kind (${component})`,
      ).toBe(true);
    }
  });

  it("names only harness or library testids in interactions and asserts", () => {
    // Static contract: a referenced id is either markup a mount owns (harness-*) or one
    // of the ids the LIBRARY renders and documents — never application markup. The
    // library list is explicit because a typo like "harness-toast-region" (the region's
    // real id is toast-region) passed a prefix-only check and would only have failed in
    // the browser suite. Explicit beats clever here.
    const LIBRARY_IDS = new Set(["toast-region"]);
    for (const c of cases) {
      for (const id of referencedTestids(c)) {
        expect(id.startsWith("harness-") || LIBRARY_IDS.has(id), `case ${c.id} references "${id}"`).toBe(true);
      }
    }
  });

  it("states a note on every case — the docs caption is not optional", () => {
    for (const c of cases) expect((c as Case).note.length).toBeGreaterThan(10);
  });
});
