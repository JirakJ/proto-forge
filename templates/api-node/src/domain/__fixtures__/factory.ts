import type { z } from "zod";

// Fixture data is built from the schema it must not drift from: every produced
// value is PARSED through the schema, so a drifted default fails loudly at the
// call site with zod naming the field. Deterministic by construction — values
// derive from a counter reset before each test (src/test/setup.ts), never from
// Math.random or Date.now, so two runs see byte-identical fixtures.
//
// This lives under domain/__fixtures__ (coverage- and build-excluded, imported
// only by tests and fixtures) because the boundary profile lets every layer's
// fixtures reach the domain, while src/test/** is reachable from no layer.
// src/test/factory.ts re-exports it for test-infra consumers.

let sequence = 0;

/** The per-test counter. Reset by setup.ts before each test. */
export function nextSequence(): number {
  sequence += 1;
  return sequence;
}

export function resetFactorySequence(): void {
  sequence = 0;
}

/**
 * Build a factory for `schema`. `defaults` receives the sequence number so ids
 * can vary per instance while staying deterministic; `overrides` win per field.
 * The result is `schema.parse(...)`d — the factory cannot produce a value the
 * domain would reject.
 */
export function defineFactory<S extends z.ZodType>(
  schema: S,
  defaults: (seq: number) => z.input<S>,
): (overrides?: Partial<z.input<S>>) => z.output<S> {
  return (overrides = {}) => {
    const seq = nextSequence();
    return schema.parse({ ...(defaults(seq) as object), ...overrides });
  };
}
