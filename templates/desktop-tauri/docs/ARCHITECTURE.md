# Architecture

A single-page React 19 + TypeScript app with strict DDD layering. Dependencies point inward; the import boundaries are lint-enforced (`eslint-plugin-boundaries`).

## Layers

| Layer | Path | May import | Purpose |
|---|---|---|---|
| ui | `packages/proto-ui/**` | ui | Owned primitives + design tokens (`@jj/proto-ui`). |
| domain | `src/domain/**` | domain, config | Pure entities, zod schemas, repository ports. No I/O. |
| infra | `src/infra/**` | domain, config, shared | Real adapters implementing ports (persistence/api/auth). |
| features | `src/features/**` | ui, domain, infra, i18n, shared, config | Feature slices composed from primitives. |
| app | `src/app/**` | everything | Shell, routing, composition. |
| config | `src/config/**` | config | zod-validated env. |
| i18n | `src/i18n/**` | i18n, config | i18next setup + catalogues. |
| shared | `src/shared/**` | ui, config, i18n | Cross-cutting helpers (e.g. `SafeHtml`). |

## Single sources of truth (BRS §12.3)

- Default locale → `src/i18n/config.ts`
- Design tokens → `packages/proto-ui/tokens.ts`
- Env schema → `src/config/env.ts`
- Domain types → `z.infer` of the zod schema (never hand-duplicated)
- Route table → `src/app/routes.ts`

The consistency gate asserts no second definition of any of these exists.

## Delivery

- **The shell is the delivery surface**: a Tauri 2 host (`src-tauri/`) renders the same built bundle the gates measure. Its security posture — strict CSP byte-equal to the web set, capabilities on an explicit allowlist (`core:default` only), updater disabled-or-pinned, toolchain pinned with `Cargo.lock` committed — is configuration under the mandatory `shell` gate (`scripts/shell-verify.mjs`, BR-37, ADR 203). There is no promotion chain: no `environments{}`, no chart, no CD plan.
- **Offline-verify doctrine**: `pnpm verify` never packages (NFR-16). `shell:verify` is static file checks plus a tool-gated `cargo check --locked` (enforced when cargo is present — always in CI, where the pinned rust toolchain is installed). Packaging (`tauri build`, per-OS matrix, unsigned) is a named CI stage in `.github/workflows/package.yml` and nothing else.
- **e2e honesty**: the browser suite runs against vite preview in Chromium — the app half is fully proven offline; packaged-app smoke belongs to the packaging stage (ADR 203, `docs/DELIVERY.md`).

## Governance

- **ADRs** in `docs/adr/` with in-code `// @adr NNN` anchors; one accepted ADR = one commit.
- **Prompt log** in `.prompts/`, append-only.
- **Structure snapshot** in `.proto-forge/snapshot.json` proves structural determinism (BR-14).
- **Performance budget** (ADR 007): `pnpm budget` gzips `dist/` and fails over 300 kB JS / 60 kB CSS / 250 kB per chunk. `verify` builds first, so a broken production build cannot pass.
- **Crash containment** (ADR 006): the routed content sits inside `ErrorBoundary`; a render error degrades to an announced, retryable panel, never a blank page.
- **Gates** are `pnpm` scripts; `pnpm verify` runs them all. See the root `package.json`.
