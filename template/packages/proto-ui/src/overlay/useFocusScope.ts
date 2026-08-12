import { useEffect, type RefObject } from "react";

// @adr 008 - focus entry, containment, and the way back out
//
// Extracted from Dialog, where it was tangled with the portal and the layering. Three
// separate jobs, and each one is a bug of its own if it is missing:
//
//   entry      A portalled surface sits at the END of the document, so without moving
//              focus the keyboard path to it runs through the entire app first.
//   trap       Tab must not leave a modal. On the top-layer path showModal() does this
//              natively by inerting the rest of the document, so the caller passes
//              trap: false there rather than fighting the browser.
//   return     Focus goes back where it came from — and through a STACK, so closing a
//              menu opened inside a dialog returns focus into the dialog, not to
//              whatever opened the dialog.
//
// The Tab listener is attached to the SURFACE, not to the document. That is partly
// scope hygiene — a trap is about one subtree — and partly rule: layer:scan rule 5
// allows exactly one document keydown listener in the library, in useDismiss.

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// No module-scoped opener stack: each activation captures its own opener in the
// effect's closure, and that already composes. A menu opened inside a dialog captures
// something inside the dialog, so closing the menu returns focus there and closing the
// dialog returns it to the page. An explicit stack would hold the same values in a
// second place and could disagree with the closures — state with no question to answer.

export type UseFocusScopeOptions = {
  ref: RefObject<HTMLElement | null>;
  active: boolean;
  /** Keep Tab inside the surface. False when the platform already does it. */
  trap: boolean;
  /** Where focus lands on entry: the surface itself, or its first focusable child. */
  initialFocus?: "container" | "first";
};

export function useFocusScope({ ref, active, trap, initialFocus = "container" }: UseFocusScopeOptions): void {
  useEffect(() => {
    if (!active) return;
    const surface = ref.current;
    if (surface === null) return;

    // document.activeElement is <body> when nothing is focused, never null.
    const opener = document.activeElement as HTMLElement;

    const focusables = () => [...surface.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (initialFocus === "first") {
      const first = focusables()[0];
      if (first === undefined) surface.focus();
      else first.focus();
    } else {
      surface.focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (!trap || event.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        // Nothing to move to; keep the caret where it is rather than letting the
        // browser walk out of the surface.
        event.preventDefault();
        surface.focus();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const at = document.activeElement;
      if (event.shiftKey && (at === first || at === surface)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && at === last) {
        event.preventDefault();
        first.focus();
      }
    };

    surface.addEventListener("keydown", onKeyDown);
    return () => {
      surface.removeEventListener("keydown", onKeyDown);
      opener.focus();
    };
  }, [active, trap, initialFocus, ref]);
}
