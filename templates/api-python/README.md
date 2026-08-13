# proto-forge service prototype

A production-grade Python service prototype scaffolded by the `proto-forge` skill. It type-checks under mypy --strict, regenerates its own OpenAPI contract byte-identically from FastAPI's native derivation, proves its persistence adapter against real Postgres (Testcontainers, CI-mandatory), and passes architecture, error-catalogue, migration, documentation and security gates out of the box.

If you are an agent working in this repository, read **`AGENTS.md`** first — it states the rules every change has to satisfy, and most of them are enforced before your edit lands.

## Run

```bash
pnpm install        # the gate corpus (node, BRS §18)
uv sync             # the app toolchain (python 3.12, locked)
pnpm dev            # http://localhost:3000 (needs DATABASE_URL)
pnpm verify         # every gate, fail-fast
pnpm config:show    # which gates are in force, and where each setting came from
DATABASE_URL=postgresql+psycopg://... pnpm db:migrate   # apply migrations to a real database
```

## Layout

```
src/app/
  domain/<entity>/       pure model: pydantic model (the single source of the shape),
                         repository Protocol port, no I/O
  application/           use-case services orchestrating domain + ports
  adapters/inbound/http/ the route REGISTRY (routes.py — operation_ids, endpoints,
                         problem lists), registry-driven FastAPI wiring, contract normalizer
  adapters/outbound/     SQLAlchemy/psycopg persistence implementing the ports
                         (integration tier: proven against Testcontainers Postgres in CI)
  platform/              the byte-pinned kernel: problem catalogue, structlog logger,
                         security headers, health — hashed into .proto-forge/seed.lock
  config/                pydantic-validated env (single source)
  harness/               scenario catalogue driving docs examples and the e2e run
  e2e/                   conformance runner + example capture (dev/CI tools)
  contract_emit.py       `python -m app.contract_emit` — the canonical spec on stdout
tests/unit/              the 100%-coverage suite (fixture port fake, TestClient)
tests/integration/       the real-Postgres tier (Docker-gated locally, mandatory in CI)
alembic/versions/        append-only migration history, hash-pinned in migrations.lock
importlinter/            one architecture-contract file per profile; arch:verify selects
contract/                openapi.json (derived, locked) + released baseline
docs/adr/                ADR ledger (one accepted ADR = one commit)
docs/api/<opid>/         per-operation page + captured examples + .examples.lock
.prompts/                append-only prompt log
.proto-forge/            config + facets + architecture record + snapshot + locks + outbox
.claude/                 hooks that block seed edits, threshold drops and gate bypasses
scripts/                 the gate scripts (Tier-1 selftest + CI-only native Tier 2)
```

## The four rules with teeth

1. **Every client-visible error is a registered problem type.** RFC 9457, stable codes, one catalogue; an invented error shape fails the build.
2. **Every operation has a unique, deterministic operationId** in one route registry. A route wired anywhere else fails.
3. **Migrations are append-only** and hash-pinned; the model must describe exactly what they produce.
4. **The committed contract and docs examples are locked derivations of the code.** Drift fails; a breaking change needs a contract major bump plus an ADR.

## The example slice is a demo

The Notes API (`notes-list/get/create/delete`), its domain, adapter, migrations, docs and harness cases are the self-verifying reference slice (ADRs 010/022/030). On a real generation run the skill **removes** them and builds the brief's real operations under the same per-endpoint Definition of Done.

## Gates

Every gate is a `pnpm` script, so local and CI runs are identical (CI just runs `pnpm verify`, then the CI-only `gates:selftest:native` tier). `pnpm gates:selftest` builds a throwaway project per failure mode and proves each gate still rejects what it claims to. The architecture profile itself is derived from `.proto-forge/facets.json` and re-derived on every run (`pnpm arch:verify`). Python has no in-process Postgres, so the real-database tier is `tests/integration` over Testcontainers — skipped with a loud note where Docker is absent, hard-required in CI (ADR 003). See `package.json`, `AGENTS.md` and `docs/ARCHITECTURE.md`.
