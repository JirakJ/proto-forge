# proto-forge service prototype

A production-grade .NET 10 service prototype scaffolded by the `proto-forge` skill. It builds on an SDK pinned in `global.json` with locked NuGet resolution, holds its behavioural core at 100 % coverlet coverage under Stryker.NET mutation testing, regenerates its own OpenAPI contract byte-identically from the route registry through the app's own `--emit-openapi` console mode, proves persistence against a real Postgres in a container-backed tier, and passes architecture, error-catalogue, migration, documentation and security gates out of the box.

If you are an agent working in this repository, read **`AGENTS.md`** first — it states the rules every change has to satisfy, and most of them are enforced before your edit lands.

## Run

```bash
pnpm install        # the gate corpus (node 22 + pnpm; the .mjs gates are dependency-free)
dotnet tool restore # the pinned local tools (dotnet-ef, dotnet-stryker) from .config/dotnet-tools.json
DATABASE_URL=postgres://notes@localhost:5432/notes pnpm dev   # boot against a real Postgres
pnpm verify         # every gate, fail-fast (no database and no Docker needed)
pnpm config:show    # which gates are in force, and where each setting came from
DATABASE_URL=postgres://... pnpm db:migrate   # apply migrations to a real database
pnpm test:native    # the real-database tier (needs Docker; CI runs it always)
```

There is no in-memory database mode by design (BR-12/§15): a main run requires `DATABASE_URL`, while the whole verify pipeline runs socket-free on `WebApplicationFactory<Program>` slices over the fixture repository.

## Layout

```
src/App/
  Domain/              pure model: records + DataAnnotations constraints (the
                       single source of shape), repository ports, no I/O
  Application/         use-case services orchestrating domain + ports (injected
                       TimeProvider + IIdGenerator)
  Adapters/In/Http/    the route REGISTRY (RouteRegistry/NoteRoutes — operationIds,
                       shapes, problem lists), the registrar-driven minimal-API
                       wiring, the handlers, the OpenAPI emitter
  Adapters/Out/Persistence/  EF Core + Npgsql implementing the ports, plus the
                       append-only Migrations/ history (<utc-timestamp>_<Name>.cs,
                       hash-pinned in migrations.lock)
  Platform/            the byte-pinned kernel: problem catalogue + RFC 9457
                       middleware, redacting AppLogger, security headers, health —
                       hashed into .proto-forge/seed.lock
  Config/              AppOptions (single source of runtime configuration)
  Program.cs           composition root, and the --emit-openapi / --migrate modes
tests/App.Tests/
  Domain|Application|Platform/  unit suites
  Arch/                the ArchUnitNET profile over the compiled assembly
  Slices/              the WebApplicationFactory<Program> composition (fixture repo
                       behind the port, clock and ids pinned)
  Fixtures/            schema-validated factories + the in-memory port fake
  Harness/             scenario catalogue driving docs examples and the e2e run
  E2E/                 the conformance + capture tiers
  Persistence/         the real-database tier (a Postgres container, Docker-gated)
contract/              openapi.json (derived, locked) + released baseline
docs/adr/              ADR ledger (one accepted ADR = one commit)
docs/api/<opid>/       per-operation page + captured examples + .examples.lock
.prompts/              append-only prompt log
.proto-forge/          config + facets + architecture record + snapshot + locks + outbox
.claude/               hooks that block seed edits, threshold drops and gate bypasses
scripts/               the gate scripts (and their two-tier self-test)
```

## The four rules with teeth

1. **Every client-visible error is a registered problem type.** RFC 9457, stable codes, one catalogue; an invented error shape fails the build.
2. **Every operation has a unique, deterministic operationId** in one route registry. A `MapGet("/…")`-style path literal anywhere else fails.
3. **Migrations are append-only** and hash-pinned; the EF model must describe exactly what they produce.
4. **The committed contract and docs examples are locked derivations of the code.** Drift fails; a breaking change needs a contract major bump plus an ADR.

## The example slice is a demo

The Notes API (`notes-list/get/create/delete`), its domain, adapter, migrations, docs and harness cases are the self-verifying reference slice (ADRs 010/022/030). On a real generation run the skill **removes** them and builds the brief's real operations under the same per-endpoint Definition of Done.

## Gates

Every gate is a `pnpm` script, so local and CI runs are identical (CI just runs `pnpm verify`, plus the Docker-gated tiers: `pnpm test:native` and `pnpm gates:selftest:native`). `pnpm gates:selftest` builds a throwaway project per failure mode and proves each gate still rejects what it claims to — with the same case-name set as its sibling templates (§18 structural symmetry). The architecture profile itself is derived from `.proto-forge/facets.json` and re-derived on every run (`pnpm arch:verify`). When `verify` is red, `pnpm heal` works it in tiers — mechanical regenerations first, a consent-gated agent pass second, escalation third, every pass prompt-logged (`docs/TROUBLESHOOTING.md`). See `package.json`, `AGENTS.md` and `docs/ARCHITECTURE.md`.
