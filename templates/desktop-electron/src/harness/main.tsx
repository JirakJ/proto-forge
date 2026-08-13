import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Harness } from "./Harness";

// The harness entry point. Only built when VITE_HARNESS=1 adds harness.html to the
// Rollup input; a production `pnpm build` never sees this file.
const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

createRoot(rootEl).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
