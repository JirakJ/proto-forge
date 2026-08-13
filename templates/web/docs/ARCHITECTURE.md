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

- **Environments** are a single declaration: `.proto-forge/config.json` `environments{}` (fixed chain `local, dev → sit → uat → test → prod`, only `dev` enabled out of the box). Values files, the `docs/DEPLOYMENT.md` table and the CD plan are derived from it, and `env:verify` fails any drift (ADR 200).
- **One image, one chart**: a digest-pinned, non-root, arbitrary-UID-safe nginx image (built once, promoted by digest) and one Helm chart with per-environment values under `deploy/chart/values/` (ADR 201). Compose (`deploy/compose/`) is the single-host simple mode.
- **Offline-verify doctrine**: `pnpm verify` never opens a socket. `deploy:verify` proves the committed deploy surface — Dockerfile pins, compose healthchecks, the securityContext contract, rendered manifests against schemas vendored in `deploy/schemas/` — with external tools enforced when present, noted when absent locally, mandatory in CI. Cluster-touching steps (build, scan, sign, push, deploy, smoke) are named CI stages, never gates (ADR 202).

## Governance

- **ADRs** in `docs/adr/` with in-code `// @adr NNN` anchors; one accepted ADR = one commit.
- **Prompt log** in `.prompts/`, append-only.
- **Structure snapshot** in `.proto-forge/snapshot.json` proves structural determinism (BR-14).
- **Performance budget** (ADR 007): `pnpm budget` gzips `dist/` and fails over 300 kB JS / 60 kB CSS / 250 kB per chunk. `verify` builds first, so a broken production build cannot pass.
- **Crash containment** (ADR 006): the routed content sits inside `ErrorBoundary`; a render error degrades to an announced, retryable panel, never a blank page.
- **Gates** are `pnpm` scripts; `pnpm verify` runs them all. See the root `package.json`.
