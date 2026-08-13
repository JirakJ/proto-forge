import { useEffect } from "react";

// @adr 008 - a modal that is not inert is not modal
//
// `aria-modal="true"` is a promise to assistive technology, not a mechanism: Tab and a
// screen reader's own cursor both still reach the page behind the dialog. `inert` is
// the mechanism — the subtree stops being focusable, clickable and reachable at once.
//
// On the top-layer path this is unnecessary: showModal() inerts the rest of the
// document natively, and doing it twice would fight the browser. The caller passes
// `active` accordingly, which is why the capability check lives there and not here.
//
// Crucially the attribute goes on the APP ROOT, never on <body>. The overlay host is a
// body-level sibling of the app root, so marking the body would make the portalled
// surface itself unreachable — the bug this is meant to prevent, inverted.

const APP_ROOT_ID = "root";

let holds = 0;
/** Was the app root already inert for reasons of its own? Then leave it that way. */
let preexisting = false;

export function useInertBackground(active: boolean, appRootId: string = APP_ROOT_ID): void {
  useEffect(() => {
    if (!active) return;
    const root = document.getElementById(appRootId);
    // No app root is a legitimate state in a unit test that renders a surface alone.
    if (root === null) return;
    if (holds === 0) {
      preexisting = root.hasAttribute("inert");
      root.setAttribute("inert", "");
    }
    holds += 1;
    return () => {
      holds -= 1;
      if (holds === 0 && !preexisting) root.removeAttribute("inert");
    };
  }, [active, appRootId]);
}
