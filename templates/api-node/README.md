# proto-forge service prototype

A production-grade Node service prototype scaffolded by the `proto-forge` skill. It compiles, tests against a real in-process Postgres engine, regenerates its own OpenAPI contract byte-identically, and passes architecture, error-catalogue, migration, documentation and security gates out of the box.

If you are an agent working in this repository, read **`AGENTS.md`** first — it states the rules every change has to satisfy, and most of them are enforced before your edit lands.

## Run

```bash
pnpm install
pnpm dev            # http://localhost:3000
pnpm verify         # every gate, fail-fast
pnpm config:show    # which gates are in force, and where each setting came from
DATABASE_URL=postgres://... pnpm db:migrate   # apply migrations to a real database
```

## Layout

```
src/
  domain/<entity>/     pure model: zod schema (the single source of the shape),
                       repository port, no I/O
  application/         use-case services orchestrating domain + ports
  adapters/in/http/    the route REGISTRY (routes.ts — operationIds, schemas,
                       problem lists), registry-driven Fastify wiring, contract emitter
  adapters/out/        drizzle/pg persistence implementing the ports
  platform/            the byte-pinned kernel: problem catalogue, pino logger,
                       security headers, health — hashed into .proto-forge/seed.lock
  config/              zod-validated env (single source)
  harness/             scenario catalogue driving docs examples and the e2e run
  e2e/                 conformance runner + example capture (dev/CI tools)
db/migrations/         append-only SQL history, hash-pinned in migrations.lock
contract/              openapi.json (derived, locked) + released baseline
docs/adr/              ADR ledger (one accepted ADR = one commit)
docs/api/<opid>/       per-operation page + captured examples + .examples.lock
.prompts/              append-only prompt log
.proto-forge/          config + facets + architecture record + snapshot + locks + outbox
.claude/               hooks that block seed edits, threshold drops and gate bypasses
scripts/               the gate scripts (and their self-test)
```

## The four rules with teeth

1. **Every client-visible error is a registered problem type.** RFC 9457, stable codes, one catalogue; an invented error shape fails the build.
2. **Every operation has a unique, deterministic operationId** in one route registry. A route wired anywhere else fails.
3. **Migrations are append-only** and hash-pinned; the model must describe exactly what they produce.
4. **The committed contract and docs examples are locked derivations of the code.** Drift fails; a breaking change needs a contract major bump plus an ADR.

## The example slice is a demo

The Notes API (`notes-list/get/create/delete`), its domain, adapter, migrations, docs and harness cases are the self-verifying reference slice (ADRs 010/022/030). On a real generation run the skill **removes** them and builds the brief's real operations under the same per-endpoint Definition of Done.

## Gates

Every gate is a `pnpm` script, so local and CI runs are identical (CI just runs `pnpm verify`). `pnpm gates:selftest` builds a throwaway project per failure mode and proves each gate still rejects what it claims to. The architecture profile itself is derived from `.proto-forge/facets.json` and re-derived on every run (`pnpm arch:verify`). See `package.json`, `AGENTS.md` and `docs/ARCHITECTURE.md`.
