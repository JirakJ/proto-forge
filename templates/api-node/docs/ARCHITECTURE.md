# Architecture

A Fastify 5 + TypeScript service with a complexity-derived architecture profile. Dependencies point inward; the import boundaries are lint-enforced (`eslint-plugin-boundaries`) and re-proved standalone by `pnpm arch:verify`.

## Layers

| Layer | Path | May import | Purpose |
|---|---|---|---|
| domain | `src/domain/**` | domain, zod | Pure entities: zod schemas (the shape's single source), repository ports. No I/O. |
| application | `src/application/**` | application, domain, platform | Use-case services orchestrating domain + ports. |
| adapter-in | `src/adapters/in/**` | application, domain, platform, config (+ adapter-in outside the hexagonal profile) | The route registry, registry-driven Fastify wiring, the contract emitter. |
| adapter-out | `src/adapters/out/**` | application, domain, platform, config (+ adapter-out outside the hexagonal profile) | drizzle/pg persistence implementing the ports. |
| platform | `src/platform/**` | platform (pino, zod, fastify) | The byte-pinned kernel: problem catalogue, logger, security headers, health. |
| config | `src/config/**` | config (zod) | zod-validated env. |
| main | `src/main.ts` | everything | Composition root; opens the socket. |

## Profiles and derivation (ADR 005, BR-21)

The style is a pure function of `.proto-forge/facets.json` (decision table T15-T17): `X >= 3` external systems or broker messaging → **hexagonal**; else `C >= 2` entity-graph components or `E >= 8` entities → **modular**; else → **layered**. The result is recorded in `.proto-forge/architecture.json` `{style, inputs}`; `eslint.config.js` selects its edge table FROM that record, and `arch:verify` re-derives the style and re-proves the imports on every run. This prototype derives **layered** from E=1, X=0, C=1.

## Single sources of truth (BRS §12.3)

- Env schema → `src/config/env.ts` (`EnvSchema`)
- Problem catalogue → `src/platform/problems.ts` (`problems`)
- Route table → `src/adapters/in/http/routes.ts` (`routes`)
- Domain types → `z.infer` of the zod schema (never hand-duplicated)
- The contract, docs examples and the conformance suite are all DERIVED from the route table

The consistency gate asserts no second definition of any of these exists.

## Governance

- **ADRs** in `docs/adr/` with in-code `// @adr NNN` anchors (the gate corpus counts as production code here); one accepted ADR = one commit.
- **Prompt log** in `.prompts/`, append-only.
- **Structure snapshot** in `.proto-forge/snapshot.json` proves structural determinism (BR-14); `.proto-forge/seed.lock` byte-pins the platform kernel AND the gate corpus as one digest.
- **Contract** (ADR 008): `contract/openapi.json` is a locked derivation; breaking changes require a contract major bump plus an ADR.
- **Migrations** (ADR 006): append-only history in `db/migrations/`, hash-pinned in `.proto-forge/migrations.lock`, executed against PGlite at verify time.
- **Gates** are `pnpm` scripts; `pnpm verify` runs them all. See the root `package.json`.
