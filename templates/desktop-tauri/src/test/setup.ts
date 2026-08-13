import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { resetFactorySequence } from "./factory";

// Determinism (NFR-18): date logic must not pass on one machine's timezone and
// fail on another's. vite.config.ts pins test.env.TZ = "UTC", which vitest
// applies when it SPAWNS a worker — a worker thread cannot re-read TZ after it
// starts, so a runtime re-pin here would be theatre. The assertion makes a
// dropped pin fail HERE, loudly, instead of months later as a flaky date
// assertion on someone else's laptop. One deliberate softening: a runner that
// builds its own workers before applying test.env (the stryker sandbox does)
// leaves process.env.TZ = "UTC" declared but untaken — that state warns instead
// of throwing, because the unit tier has already enforced the real guarantee.
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
if (timeZone !== "UTC") {
  if (process.env.TZ === "UTC") {
    process.stderr.write(
      `⚠ TZ=UTC is declared but this worker resolved "${timeZone}" — spawned before the pin could take ` +
        "(worker threads cannot change timezone after start). The plain vitest run enforces the pin.\n",
    );
  } else {
    throw new Error(
      `Tests must run under TZ=UTC but the resolved zone is "${timeZone}". ` +
        "The pin lives in vite.config.ts (test.env.TZ) — restore it, and do not override TZ in the shell. " +
        "See docs/TROUBLESHOOTING.md (timezone-dependent tests).",
    );
  }
}

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
