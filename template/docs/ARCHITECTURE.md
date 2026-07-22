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

## Governance

- **ADRs** in `docs/adr/` with in-code `// @adr NNN` anchors; one accepted ADR = one commit.
- **Prompt log** in `.prompts/`, append-only.
- **Structure snapshot** in `.proto-forge/snapshot.json` proves structural determinism (BR-14).
- **Gates** are `pnpm` scripts; `pnpm verify` runs them all. See the root `package.json`.
