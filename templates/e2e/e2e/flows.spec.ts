import { test, expect } from "@playwright/test";
import { flowCases } from "../src/flows/cases";
import { implementations as noteFlows } from "../src/flows/notes.flow";
import { ensureService, webUrl } from "./support/services";

// @adr 001 - the cross-app FLOW suite is GENERATED from the case registry
//
// One loop, one contract, every flow. Adding a case to src/flows/cases.ts adds
// its test here with no further work, and registry:verify fails when a case has
// no implementation (or an implementation no case) — so a scenario cannot ship
// without coverage, and the suite cannot drift from the registry because they
// are the same data. Generation appends new *.flow.ts modules to the merge
// below; registry:verify holds the two lists equal from outside the runner.

const implementations = { ...noteFlows };

test.beforeEach(async () => {
  await ensureService(webUrl(), "the web part");
});

for (const c of flowCases) {
  test(`${c.id}: ${c.title}`, async ({ page }) => {
    const implementation = implementations[c.id];
    // registry:verify makes this unreachable; the message exists for the day
    // someone runs a stale checkout where it is not.
    expect(implementation, `flow case "${c.id}" has no implementation — run pnpm registry:verify`).toBeDefined();
    await implementation?.(page);
  });
}
