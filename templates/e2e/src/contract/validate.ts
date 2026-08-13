import { readFileSync } from "node:fs";
import {
  findOperation,
  listOperationIds,
  locateContract,
  responseSchema,
  validateAgainstSchema,
  type FoundOperation,
} from "../../scripts/validate-lib.mjs";

// @adr 001 - thin typed facade over the shared plain-JS validator
//
// The implementation lives in scripts/validate-lib.mjs so ONE validator serves
// three consumers: this Playwright suite, the registry:verify gate, and the
// gates-selftest fixtures that prove it rejects what the contract forbids.
// This file only adds types and the "read the located contract" convenience.

export { findOperation, listOperationIds, locateContract, responseSchema, validateAgainstSchema };
export type { FoundOperation };

export type LoadedContract = {
  spec: Record<string, unknown>;
  /** Where the contract was found — E2E_CONTRACT, the workspace manifest, or the pair convention. */
  origin: string;
  path: string;
};

/**
 * Read and parse the contract the workspace points at. Throws when the file is
 * absent or unreadable — the SPEC decides whether that is a local skip or a CI
 * failure (e2e/support/services.ts documents the tool-gating policy).
 */
export function loadContract(): LoadedContract {
  const { path, origin } = locateContract();
  const spec: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (spec === null || typeof spec !== "object" || Array.isArray(spec)) {
    throw new Error(`${path} (${origin}) does not hold an OpenAPI document`);
  }
  return { spec: spec as Record<string, unknown>, origin, path };
}
