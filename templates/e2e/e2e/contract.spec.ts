import { test, expect } from "@playwright/test";
import { contractCases } from "../src/contract/cases";
import { findOperation, loadContract, responseSchema, validateAgainstSchema, type LoadedContract } from "../src/contract/validate";
import { apiUrl, ensureContract, ensureService } from "./support/services";

// @adr 001 - the CONSUMER-DRIVEN contract suite, generated from the case registry
//
// The backend proves "my code matches my spec" on its own (contract:verify);
// this suite proves the complementary claim FROM THE CONSUMER'S SEAT: for each
// registered expectation, the LIVE api answers with the promised status and a
// body the contract's response schema accepts. A pair can drift in exactly the
// gap between those two claims — a redeployed api, a stale artifact — and this
// is the suite that catches it. The contract is resolved through the workspace
// manifest (E2E_CONTRACT overrides); services and artifact are tool-gated per
// e2e/support/services.ts: skip+note locally, hard-fail under CI=1.

let contract: LoadedContract | undefined;

test.beforeEach(async () => {
  await ensureService(apiUrl(), "the api part");
  contract = ensureContract(loadContract, "the workspace's contract.source");
});

for (const c of contractCases) {
  test(`${c.id}: ${c.request.method} ${c.request.path} answers ${String(c.expectation.status)} per ${c.operationId}`, async ({ request }) => {
    const spec = contract?.spec;
    expect(spec, "contract not loaded — the beforeEach gate should have skipped").toBeDefined();
    if (spec === undefined) return;

    const found = findOperation(spec, c.operationId);
    expect(found, `operationId "${c.operationId}" is not in the contract — registry:verify catches this statically`).toBeDefined();
    if (found === undefined) return;

    const response = await request.fetch(new URL(c.request.path, apiUrl()).toString(), {
      method: c.request.method,
      ...(c.request.body === undefined ? {} : { data: c.request.body }),
    });
    expect(response.status(), `${c.operationId} must answer ${String(c.expectation.status)}`).toBe(c.expectation.status);

    const declared = responseSchema(found.operation, c.expectation.status);
    const body = await response.text();
    if (declared === undefined) {
      // The contract declares no body for this status (e.g. 204): hold it to that.
      expect(body, `the contract declares no body for ${String(c.expectation.status)}, but one arrived`).toBe("");
      return;
    }
    const errors = validateAgainstSchema(declared.schema, JSON.parse(body) as unknown, spec);
    expect(errors, `the ${String(c.expectation.status)} body must validate against the contract's response schema`).toEqual([]);
  });
}
