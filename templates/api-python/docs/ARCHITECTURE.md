# Architecture

A FastAPI + Python 3.12 service with a complexity-derived architecture profile. Dependencies point inward; the import boundaries are contract-enforced (import-linter, one profile file per style) and re-proved standalone by `pnpm arch:verify`.

## Layers

| Layer | Path | May import | Purpose |
|---|---|---|---|
| domain | `src/app/domain/**` | domain, pydantic | Pure entities: pydantic models (the shape's single source), repository Protocol ports. No I/O. |
| application | `src/app/application/**` | application, domain, platform | Use-case services orchestrating domain + ports. |
| adapter-in | `src/app/adapters/inbound/**` | application, domain, platform, config (+ adapter-in outside the hexagonal profile) | The route registry, registry-driven FastAPI wiring, the contract normalizer. |
| adapter-out | `src/app/adapters/outbound/**` | application, domain, platform, config (+ adapter-out outside the hexagonal profile) | SQLAlchemy/psycopg persistence implementing the ports. |
| platform | `src/app/platform/**` | platform (structlog, pydantic, fastapi/starlette) | The byte-pinned kernel: problem catalogue, logger, security headers, health. |
| config | `src/app/config/**` | config (pydantic) | pydantic-validated env. |
| main | `src/app/main.py` | everything | Composition root; opens the socket. |

`in` is a Python reserved word, so the adapter packages are named `inbound`/`outbound` — the same two elements the register calls `adapters/in` and `adapters/out` (ADR 005).

## Profiles and derivation (ADR 005, BR-21)

The style is a pure function of `.proto-forge/facets.json` (decision table T15-T17): `X >= 3` external systems or broker messaging → **hexagonal**; else `C >= 2` entity-graph components or `E >= 8` entities → **modular**; else → **layered**. The result is recorded in `.proto-forge/architecture.json` `{style, inputs}`; `arch:verify` selects the ACTIVE contract file (`importlinter/<style>.toml`) FROM that record, runs it through `uv run lint-imports`, re-derives the style and re-proves the imports with its own standalone scan on every run. This prototype derives **layered** from E=1, X=0, C=1.

## Single sources of truth (BRS §12.3)

- Env model → `src/app/config/env.py` (`Env`)
- Problem catalogue → `src/app/platform/problems.py` (`problems`)
- Route table → `src/app/adapters/inbound/http/routes.py` (`routes`)
- Domain types → the pydantic model itself (never hand-duplicated; the model IS the schema)
- The contract, docs examples and the conformance suite are all DERIVED from the route table

The consistency gate asserts no second definition of any of these exists.

## Governance

- **ADRs** in `docs/adr/` with in-code `# @adr NNN` anchors (`// @adr` in the gate corpus, which counts as production code here); one accepted ADR = one commit.
- **Prompt log** in `.prompts/`, append-only.
- **Structure snapshot** in `.proto-forge/snapshot.json` proves structural determinism (BR-14); `.proto-forge/seed.lock` byte-pins the platform kernel AND the gate corpus as one digest.
- **Contract** (ADR 008): `contract/openapi.json` is a locked derivation of `app.openapi()`; breaking changes require a contract major bump plus an ADR.
- **Migrations** (ADR 006): append-only history in `alembic/versions/`, hash-pinned in `.proto-forge/migrations.lock`; model agreement name-level on every verify and schema-level against Testcontainers Postgres in CI (BRS §15/§19 — Python has no in-process engine).
- **Gates** are `pnpm` scripts; `pnpm verify` runs them all. The gate corpus is Node (BRS §18) while the toolchain is uv. See the root `package.json`.
