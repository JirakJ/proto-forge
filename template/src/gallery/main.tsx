import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Gallery } from "./Gallery";

// Separate entry point (gallery.html). It is only added to the Rollup input when
// VITE_GALLERY=1, so the production bundle — and the budget gate — never see it.
const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

createRoot(rootEl).render(
  <StrictMode>
    <Gallery />
  </StrictMode>,
);
