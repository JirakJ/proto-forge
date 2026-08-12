import { useEffect, useRef, type RefObject } from "react";
import type { OverlaySlot } from "./OverlayStack";

// @adr 008 - one dismiss owner for the whole library
//
// Every overlay used to own a `document` keydown listener. With one overlay that is
// indistinguishable from correct; with two it is a bug you cannot see in a unit test:
// Escape inside a menu that sits in a dialog fires BOTH listeners, so the menu and the
// dialog close together and the user loses their place.
//
// So there is exactly one keydown listener and one pointerdown listener in the library,
// installed when the first surface registers and removed when the last one leaves. They
// dispatch to the topmost surface only — which is why the stack computes `isTopmost`
// (OverlayStack) rather than each surface guessing.
//
// layer:scan rule 5 enforces the "exactly one" part: document.addEventListener("keydown")
// anywhere else under packages/proto-ui/ fails the build.

/**
 * Everything the listeners read, held in a ref rather than in the registry entry.
 *
 * The ordinal belongs here, not in the effect's dependencies, and that is not a
 * micro-optimisation. A surface's first effect runs before the provider has assigned
 * ordinals, so it would register at -1 and re-register a moment later — and in the gap
 * between the cleanup and the re-registration the map empties, so the listeners are
 * removed and re-added on every open. Reading the ordinal at dispatch time makes
 * registration happen exactly once per surface, which is what "one listener" needs.
 */
type Latest = {
  onDismiss: () => void;
  ref: RefObject<HTMLElement | null>;
  /** The control that opened the surface, if it toggles. See `ignore` below. */
  ignore: RefObject<HTMLElement | null> | undefined;
  ordinal: number;
  escape: boolean;
  outsidePointer: boolean;
};

const entries = new Map<string, RefObject<Latest>>();
let listening = false;

/**
 * The surface Escape belongs to: the one nothing is painted above.
 *
 * An entry can be at ordinal -1 for one render: it registers here in its first effect,
 * and the stack assigns its number a re-render later. An event landing in that window —
 * a browser test proved it does, by pressing Escape straight after opening a second
 * dialog and closing the FIRST one — must still hit the newest surface. Within this
 * map, -1 therefore means "just opened", which is newer than everything already
 * numbered, and among several it is the latest-registered one: the map's insertion
 * order IS open order, which is the same fact the stack formalises one render later.
 */
function topmost(): Latest | undefined {
  let best: Latest | undefined;
  for (const entry of entries.values()) {
    const current = entry.current;
    if (best === undefined || current.ordinal === -1 || (best.ordinal !== -1 && current.ordinal > best.ordinal)) {
      best = current;
    }
  }
  return best;
}

function handleKeyDown(event: KeyboardEvent): void {
  if (event.key !== "Escape") return;
  const entry = topmost();
  if (entry === undefined || !entry.escape) return;
  // Stop the event before an outer surface's own handling can see it. Without this a
  // native <dialog> would also close on the same keystroke.
  event.preventDefault();
  event.stopPropagation();
  entry.onDismiss();
}

/**
 * Is `target` inside the surface, or inside the toggle that opened it? A pointer on the
 * toggle is not an outside click: dismissing there would close the surface, and the
 * click that follows would reopen it — so the toggle would appear dead.
 */
function insideOwnTerritory(entry: Latest, target: Node): boolean {
  const surface = entry.ref.current;
  if (surface === null || surface.contains(target)) return true;
  const toggle = entry.ignore?.current;
  return toggle !== null && toggle !== undefined && toggle.contains(target);
}

function handlePointerDown(event: Event): void {
  const entry = topmost();
  if (entry === undefined || !entry.outsidePointer) return;
  if (insideOwnTerritory(entry, event.target as Node)) return;
  entry.onDismiss();
}

function sync(): void {
  const wanted = entries.size > 0;
  if (wanted === listening) return;
  if (wanted) {
    // Capture phase: a surface must be able to dismiss before app handlers run.
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("pointerdown", handlePointerDown, true);
  } else {
    document.removeEventListener("keydown", handleKeyDown, true);
    document.removeEventListener("pointerdown", handlePointerDown, true);
  }
  listening = wanted;
}

export type UseDismissOptions = {
  /** The surface itself. A pointer inside it is not an outside click. */
  ref: RefObject<HTMLElement | null>;
  /**
   * A control that toggles the surface — a menu button. Pointers on it are left alone so
   * the toggle's own handler decides, instead of dismiss and reopen cancelling out.
   */
  ignore?: RefObject<HTMLElement | null>;
  slot: OverlaySlot;
  onDismiss: () => void;
  /** False while the surface is closed, so a closed overlay never competes for Escape. */
  enabled: boolean;
  /** Off for a modal on the top-layer path, where the native `cancel` event owns Escape. */
  escape?: boolean;
  /** Off for a toast, which is not dismissed by clicking elsewhere. */
  outsidePointer?: boolean;
};

export function useDismiss({
  ref,
  slot,
  onDismiss,
  enabled,
  ignore,
  escape = true,
  outsidePointer = true,
}: UseDismissOptions): void {
  const state: Latest = { onDismiss, ref, ignore, ordinal: slot.ordinal, escape, outsidePointer };
  const latest = useRef<Latest>(state);
  latest.current = state;

  // Deps are the identity of the surface and whether it is open — nothing that changes
  // while it stays open. That is what keeps registration to once per surface.
  useEffect(() => {
    if (!enabled) return;
    entries.set(slot.id, latest);
    sync();
    return () => {
      entries.delete(slot.id);
      sync();
    };
  }, [enabled, slot.id]);
}
