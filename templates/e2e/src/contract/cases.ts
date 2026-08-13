// @adr 001 - the consumer-driven contract registry: pure data, replayed per operation
//
// Each case is ONE consumer expectation: replay this request against the live
// api, assert the status, and validate the response body against the contract's
// response schema for that operation+status (src/contract/validate.ts). The
// contract itself is the backend's locked artifact, resolved through the
// workspace manifest (../workspace.json contract.source; E2E_CONTRACT overrides).
// registry:verify proves every operationId below exists in that contract
// whenever the file is reachable. The shipped cases exercise the Note demo pair
// and are replaced on a real generation run.
//
// Convention (parsed by registry:verify): every case object OPENS with its
// `id` field — `{ id: "…"` is what the gate counts as a case.

export type ContractCase = {
  /** Stable kebab-case id, unique across every registry — also the test's name. */
  id: string;
  /** Must exist in the referenced contract (registry:verify checks). */
  operationId: string;
  request: {
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    /** Path relative to E2E_API_URL, with any parameters already substituted. */
    path: string;
    /** JSON body, when the operation takes one. */
    body?: unknown;
  };
  expectation: {
    /** The response status this consumer relies on — schema validation follows it. */
    status: number;
  };
};

// The all-zero uuid is valid per the contract's id format, and no live pair
// ever assigns it — a deterministic "this resource does not exist" probe.
const MISSING_ID = "00000000-0000-0000-0000-000000000000";

export const contractCases: readonly ContractCase[] = [
  {
    id: "notes-list-replies-with-the-collection",
    operationId: "notes-list",
    request: { method: "GET", path: "/notes" },
    expectation: { status: 200 },
  },
  {
    id: "notes-create-accepts-a-valid-note",
    operationId: "notes-create",
    request: { method: "POST", path: "/notes", body: { text: "consumer contract probe" } },
    expectation: { status: 201 },
  },
  {
    id: "notes-create-rejects-an-empty-text",
    operationId: "notes-create",
    request: { method: "POST", path: "/notes", body: { text: "" } },
    expectation: { status: 400 },
  },
  {
    id: "notes-get-missing-is-a-registered-problem",
    operationId: "notes-get",
    request: { method: "GET", path: `/notes/${MISSING_ID}` },
    expectation: { status: 404 },
  },
  {
    id: "notes-delete-missing-is-a-registered-problem",
    operationId: "notes-delete",
    request: { method: "DELETE", path: `/notes/${MISSING_ID}` },
    expectation: { status: 404 },
  },
];
