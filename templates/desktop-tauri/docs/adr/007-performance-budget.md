# ADR 007: Performance budget as a gate

- Status: accepted
- Date: 2026-08-03
- Prompt-log: .prompts/0001-scaffold.md

## Context

Every quality axis of the prototype was gated except payload size: `verify` never built the app, so a broken production build or a bundle that grew by a megabyte passed silently. Prototypes are demoed on real networks.

## Decision

`pnpm verify` runs `build` and then `budget` (`scripts/budget.mjs`), which gzips the emitted `dist/` assets and enforces ceilings: 300 kB JS total, 60 kB CSS total, 250 kB for the largest single chunk. Raising a ceiling requires an accepted ADR; the numbers live in one constant in the script.

## Consequences

The gate suite now proves the app actually builds, and bundle growth surfaces in the run that caused it, listed asset by asset. Verify costs one extra production build (a few seconds). A genuinely heavier product must argue for its budget in an ADR instead of drifting into it.

## Alternatives considered

`size-limit`/`bundlesize` (another dependency and config file for a gzip loop `node:zlib` already does), Lighthouse CI (heavy, needs a browser and a running server, flaky in CI), no budget at all (the status quo that let payload go unmeasured).
