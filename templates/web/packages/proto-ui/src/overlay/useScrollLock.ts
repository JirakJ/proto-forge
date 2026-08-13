import { useEffect } from "react";

// @adr 008 - the scroll lock is refcounted, and restores what it found
//
// Two things go wrong with the naive version. Closing one of two open modals unlocks
// the page while the other is still blocking it; and unlocking by assigning "" throws
// away a page that was deliberately `overflow: hidden` to begin with. So: a count, and
// the original value remembered once.
//
// The count is module-scoped rather than in the stack context because it is a property
// of the document, not of a React tree. Two stacks in one document must not each
// believe they own the page's overflow.

let locks = 0;
let original = "";

/** Hold the page still while `active`. Safe to call from several surfaces at once. */
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    if (locks === 0) {
      original = root.style.overflow;
      root.style.overflow = "hidden";
    }
    locks += 1;
    return () => {
      locks -= 1;
      if (locks === 0) root.style.overflow = original;
    };
  }, [active]);
}
