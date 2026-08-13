import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// @adr 008 - overlays render through a body-level portal
// BR-16: every popup surface (dialog, menu, toast, tooltip) renders here instead
// of in place. The host is a plain, unstyled div appended last to <body>: it sets
// no position/transform/opacity/filter, so it creates NO stacking context of its
// own and tokens.layer values compete at the root level. Consequences that matter:
//   - an ancestor `transform`/`filter`/`will-change` in the app tree cannot trap it
//   - an ancestor `overflow: hidden` cannot clip it
//   - a later sibling with a high z-index cannot paint over it
// Rendering in place gives none of those guarantees, which is why the "own" and
// "radix" providers both portal — same API, same layering, same tests.
export const OVERLAY_ROOT_ID = "proto-ui-overlay-root";

function overlayRoot(): HTMLElement {
  const existing = document.getElementById(OVERLAY_ROOT_ID);
  if (existing) return existing;
  const el = document.createElement("div");
  el.id = OVERLAY_ROOT_ID;
  el.setAttribute("data-testid", OVERLAY_ROOT_ID);
  document.body.append(el);
  return el;
}

export function Portal({ children }: { children: ReactNode }) {
  // Lazy initializer: resolved once per overlay instance, and overlayRoot is
  // idempotent, so StrictMode's double invocation reuses the same host.
  const [host] = useState(overlayRoot);
  return createPortal(children, host);
}
