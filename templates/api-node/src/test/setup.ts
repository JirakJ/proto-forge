import { beforeEach } from "vitest";
import { resetFactorySequence } from "./factory.js";

// Determinism (NFR-18): date logic must not pass on one machine's timezone and
// fail on another's. vitest.config.ts pins test.env.TZ = "UTC", which vitest
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
        "The pin lives in vitest.config.ts (test.env.TZ) — restore it, and do not override TZ in the shell. " +
        "See docs/TROUBLESHOOTING.md (timezone-dependent tests).",
    );
  }
}

// Deterministic fixtures: the factory counter restarts before every test, so a
// test's fixture values never depend on what ran before it.
beforeEach(() => {
  resetFactorySequence();
});
