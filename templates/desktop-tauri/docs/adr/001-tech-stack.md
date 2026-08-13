# ADR 001: Technology stack

- Status: accepted
- Date: 2026-07-05
- Prompt-log: .prompts/0001-scaffold.md

## Context

The prototype must be a production-grade web app slice: typed, testable, accessible, i18n-ready, and buildable with a pinned, reproducible toolchain (NFR-08).

## Decision

React 19 + TypeScript 5.7 (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) on Vite 6. Vitest 3 for unit/component tests, Playwright for E2E, i18next for i18n, Dexie for local persistence, zod for boundary validation. pnpm workspaces, Node 22 pinned via `.nvmrc`/`engines`.

## Consequences

Fast builds, strong typing end-to-end, one lockfile as the reproducibility contract. Node/pnpm are prerequisites of the environment.

## Alternatives considered

Next.js (SSR out of scope for v1), CRA (unmaintained), Jest (slower than Vitest, worse ESM story).
