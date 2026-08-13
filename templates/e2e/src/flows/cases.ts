// @adr 001 - one registry, two consumers, and no Playwright in the metadata
//
// This file is PURE DATA, the same split as the web template's harness: the
// generated spec (e2e/flows.spec.ts) registers one test per case, and
// registry:verify proves from OUTSIDE the test runner that every case has an
// implementation and every implementation has a case. Scenarios are derived
// from the brief's flows facets at generation time; the shipped case documents
// the pattern with the Note demo and is replaced on a real generation run.
//
// Convention (parsed by registry:verify): every case object OPENS with its
// `id` field — `{ id: "…"` is what the gate counts as a case.

export type FlowCase = {
  /** Stable kebab-case id, unique across every registry — also the test's name. */
  id: string;
  /** What a reader should expect the flow to prove. */
  title: string;
  /** The flows-facet actor this scenario belongs to. */
  actor: string;
  /** The facet steps this scenario walks, in order — documentation, not code. */
  steps: readonly string[];
};

export const flowCases: readonly FlowCase[] = [
  {
    id: "notes-create-list-delete",
    title: "a user creates a note through the real web UI, sees it listed, deletes it",
    actor: "user",
    steps: [
      "open the app",
      "create a note",
      "see it in the list",
      "delete it",
      "see it gone",
    ],
  },
];
