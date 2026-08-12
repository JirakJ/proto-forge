import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { resetFactorySequence } from "./factory";

// Fixture determinism: every test starts its factories at instance 1, so two runs of
// the same test see byte-identical data and a failure diff is readable.
beforeEach(() => {
  resetFactorySequence();
});

// BR-02 (the runtime half). Lint catches literal duplicate testids inside one
// file; only the rendered DOM shows the collisions that matter — a list that
// forgot to interpolate its key, two instances of the same component on a page, a
// portal mounted twice. Asserting it here makes every component test pay for the
// guarantee, so no feature can ship an unaddressable element.
afterEach(() => {
  const ids = [...document.querySelectorAll("[data-testid]")].map((el) => el.getAttribute("data-testid")!);
  const duplicates = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  cleanup();
  if (duplicates.length > 0) {
    throw new Error(
      `Duplicate data-testid in the rendered DOM (BR-02): ${duplicates.join(", ")}. ` +
        "Interpolate a stable id (`row-${item.id}`) or namespace the component instance.",
    );
  }
});
