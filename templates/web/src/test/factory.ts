import type { z } from "zod";

// @adr 003 - fixture data is built from the schema it must not drift from
//
// A hand-written fixture literal agrees with the domain on the day it is written; when
// the schema gains a field or narrows a type, the literal keeps passing whatever tests
// it appears in while representing a value the domain would reject. A factory closes
// that gap mechanically: every produced value is PARSED through the schema, so a
// drifted default fails loudly at the call site, with zod naming the field.
//
// Determinism is part of the contract. Ids and sequence-derived values come from a
// counter that resets between tests (wired in src/test/setup.ts), never from
// Math.random or Date.now — two runs of the same test see byte-identical fixtures,
// which is what makes a failure diff readable.

let sequence = 0;

/** The per-test counter. Deterministic and reset by setup.ts before each test. */
export function nextSequence(): number {
  sequence += 1;
  return sequence;
}

export function resetFactorySequence(): void {
  sequence = 0;
}

/**
 * Build a factory for `schema`. `defaults` receives the sequence number, so ids and
 * names can vary per instance while staying deterministic; `overrides` win per field.
 * The result is `schema.parse(...)`d, so the factory cannot produce a value the domain
 * would reject — that is the whole point.
 */
export function defineFactory<S extends z.ZodType>(
  schema: S,
  defaults: (seq: number) => z.input<S>,
): (overrides?: Partial<z.input<S>>) => z.output<S> {
  return (overrides = {}) => {
    const seq = nextSequence();
    return schema.parse({ ...(defaults(seq) as object), ...overrides }) as z.output<S>;
  };
}
