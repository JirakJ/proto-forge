import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { tokens } from "../../tokens";
import { detectCapabilities, type Capabilities } from "./capabilities";
import type { OverlayKind } from "./types";

// @adr 008 - the stack that owns overlay order, and the only reader of the fallback scale
//
// Paint order is PROMOTION order, not a per-kind constant. That distinction is the
// whole fix. A fixed scale with popover above modal is correct for one modal and
// wrong for two: a menu opened inside dialog A would paint above dialog B, which
// opened later and sits above A. Ordering by when a surface opened gives:
//
//   dialog A opens   -> ordinal 0
//   menu inside A    -> ordinal 1   (above A)
//   dialog B opens   -> ordinal 2   (above the menu)
//   menu inside B    -> ordinal 3   (above B)
//
// which is exactly what the browser's top layer does, so the fallback path and the
// primary path cannot disagree about who is on top. It also means a per-kind scale is
// not needed at all: one base plus the ordinal is the entire computation.
//
// The stack is a React context rather than a module singleton so a test can mount two
// independent stacks, and so capabilities can be pinned per tree (DIP, NFR-22).

/** Gap between consecutive overlays on the fallback scale. A surface sits at ordinal*STEP, its scrim just below. */
export const STEP = 10;

export type OverlaySlot = {
  id: string;
  kind: OverlayKind;
  /** Position in promotion order while open; -1 when closed. */
  ordinal: number;
  /** True when nothing is above this surface — the only surface Escape may dismiss. */
  isTopmost: boolean;
  /** How many surfaces are open in total, this one included. */
  depth: number;
  capabilities: Capabilities;
  /**
   * z-index for the no-top-layer path. Nothing outside this module reads
   * `tokens.layer`, so a component cannot invent an opinion about the whole page
   * (layer:scan rule 6).
   */
  fallbackZIndex: number;
};

type Entry = { id: string; kind: OverlayKind };

type StackApi = {
  entries: readonly Entry[];
  capabilities: Capabilities;
  register: (entry: Entry) => void;
  unregister: (id: string) => void;
};

const StackContext = createContext<StackApi | null>(null);

export function OverlayStackProvider({
  children,
  capabilities,
}: {
  children: ReactNode;
  /** Pinned in tests; detected from the live view otherwise. */
  capabilities?: Capabilities;
}) {
  const [entries, setEntries] = useState<readonly Entry[]>([]);
  const resolved = useMemo(() => capabilities ?? detectCapabilities(window), [capabilities]);

  // Stable identities: useOverlaySlot's effect depends on these, and a new function
  // each render would tear the registration down and rebuild it on every keystroke
  // anywhere in the tree.
  // No "already registered?" guard: useOverlaySlot's effect always unregisters before
  // it can register again — closing runs the cleanup, and a change of kind while open
  // tears down and rebuilds — so a duplicate id cannot arrive. The guard was here
  // first and the 100% branch floor found it unreachable, which is what the floor is
  // for. The invariant lives in the effect below, stated rather than defended twice.
  const register = useCallback((entry: Entry) => {
    setEntries((current) => [...current, entry]);
  }, []);
  const unregister = useCallback((id: string) => {
    setEntries((current) => current.filter((e) => e.id !== id));
  }, []);

  const value = useMemo<StackApi>(
    () => ({ entries, capabilities: resolved, register, unregister }),
    [entries, resolved, register, unregister],
  );
  return <StackContext.Provider value={value}>{children}</StackContext.Provider>;
}

/**
 * Claim a place in the stack while `open`. Returns the surface's ordinal, whether it
 * is topmost, the capabilities in force, and its fallback z-index.
 */
export function useOverlaySlot(kind: OverlayKind, open: boolean): OverlaySlot {
  const ctx = useContext(StackContext);
  if (ctx === null) {
    throw new Error("useOverlaySlot must be used within an <OverlayStackProvider>");
  }
  const id = useId();
  const { register, unregister, entries, capabilities } = ctx;

  useEffect(() => {
    if (!open) return;
    register({ id, kind });
    return () => unregister(id);
  }, [open, id, kind, register, unregister]);

  const ordinal = entries.findIndex((e) => e.id === id);
  return {
    id,
    kind,
    ordinal,
    isTopmost: ordinal !== -1 && ordinal === entries.length - 1,
    depth: entries.length,
    capabilities,
    fallbackZIndex: ordinal === -1 ? tokens.layer.base : tokens.layer.overlay + ordinal * STEP,
  };
}
