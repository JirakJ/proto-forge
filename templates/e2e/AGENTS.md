# Working in this e2e repo

Read before changing anything. This repo carries the CROSS-APP suites for a workspace pair; it owns no application code and no runtime services.

## The rules with teeth

1. **The registries are the single source.** A scenario exists when `src/flows/cases.ts` has its case AND `src/flows/*.flow.ts` has its implementation under the same quoted id — `pnpm registry:verify` fails either half alone. A contract expectation exists when `src/contract/cases.ts` registers `{id, operationId, request, expectation}`; the operationId must exist in the workspace's contract. Never write a test directly into a spec file — the specs are generated loops over the registries.
2. **`test:e2e` is not in `verify`, and must stay out.** The static gates are offline and deterministic; the runtime suites need the pair the WORKSPACE provides (`pnpm ws:up` there, or `E2E_WEB_URL`/`E2E_API_URL`/`E2E_CONTRACT`). Unreachable services skip locally and fail under CI=1 — do not "fix" a skip by weakening `e2e/support/services.ts`.
3. **The validator is byte-pinned.** `scripts/validate-lib.mjs` is part of the seed (sha256 in `.proto-forge/seed.lock`); loosening it to make a red contract run green is tamper, and a hook blocks the edit. Growing the schema subset is an ADR + `pnpm seed:lock`.
4. **The prompt log is append-only**; locks and snapshots are generated (`pnpm snapshot`, `pnpm seed:lock`). Relaxing a mandatory gate (`registry`, `stub`, `snapshot`) needs a live waiver — reason, ADR, expiry — or it runs at `error` regardless.
5. **Zero runtime dependencies.** `@playwright/test` and the TS/eslint toolchain are the whole surface; a new dependency is an ADR-worthy event.

## Commands

`pnpm verify` is the bar (static, offline). `pnpm test:e2e` against the workspace pair. `pnpm gates:selftest` after touching any script in `scripts/`.
