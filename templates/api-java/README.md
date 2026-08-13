# proto-forge service prototype

A production-grade Spring Boot service prototype scaffolded by the `proto-forge` skill. It builds with a checksum-pinned Gradle wrapper and locked dependencies, holds its behavioural core at 100 % JaCoCo coverage under PIT mutation testing, regenerates its own OpenAPI contract byte-identically from a springdoc test slice, proves persistence against a real Postgres in a Testcontainers tier, and passes architecture, error-catalogue, migration, documentation and security gates out of the box.

If you are an agent working in this repository, read **`AGENTS.md`** first — it states the rules every change has to satisfy, and most of them are enforced before your edit lands.

## Run

```bash
pnpm install        # the gate corpus (node 22 + pnpm; the .mjs gates are dependency-free)
DATABASE_URL=jdbc:postgresql://localhost:5432/notes?user=notes pnpm dev   # boot against a real Postgres
pnpm verify         # every gate, fail-fast (no database and no Docker needed)
pnpm config:show    # which gates are in force, and where each setting came from
DATABASE_URL=jdbc:postgresql://... pnpm db:migrate   # apply migrations to a real database
./gradlew nativeTest # the real-database tier (needs Docker; CI runs it always)
```

There is no in-memory database mode by design (BR-12/§15): a main run requires `DATABASE_URL`, while the whole verify pipeline runs socket-free on MockMvc slices over the fixture repository.

## Layout

```
src/main/java/app/
  domain/<entity>/     pure model: records + jakarta-validation constraints (the
                       single source of shape), repository ports, no I/O
  application/         use-case services orchestrating domain + ports (injected
                       Clock + IdGenerator)
  adapter/in/web/      the route REGISTRY (RouteRegistry — operationIds, shapes,
                       problem lists), the registrar-driven MVC wiring, handlers
  adapter/out/persistence/  Spring Data JPA implementing the ports
  platform/            the byte-pinned kernel: problem catalogue + RFC 9457
                       advice, redacting AppLogger, security headers, health —
                       hashed into .proto-forge/seed.lock
  config/              AppProperties (single source of runtime configuration)
src/main/resources/db/migration/  append-only Flyway history (VNNNN__name.sql),
                       hash-pinned in migrations.lock
src/test/java/
  app/…                unit suites, ArchUnit profile, conformance + capture slices
  app/fixtures/        schema-validated factories + the in-memory port fake
  app/harness/         scenario catalogue driving docs examples and the e2e run
  slices/              the MockMvc slice composition (fixture repo behind the port)
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
2. **Every operation has a unique, deterministic operationId** in one route registry. A mapping annotation with a path literal anywhere else fails.
3. **Migrations are append-only** and hash-pinned; the entity model must describe exactly what they produce.
4. **The committed contract and docs examples are locked derivations of the code.** Drift fails; a breaking change needs a contract major bump plus an ADR.

## The example slice is a demo

The Notes API (`notes-list/get/create/delete`), its domain, adapter, migrations, docs and harness cases are the self-verifying reference slice (ADRs 010/022/030). On a real generation run the skill **removes** them and builds the brief's real operations under the same per-endpoint Definition of Done.

## Gates

Every gate is a `pnpm` script, so local and CI runs are identical (CI just runs `pnpm verify`, plus the Docker-gated tiers: `./gradlew nativeTest` and `pnpm gates:selftest:native`). `pnpm gates:selftest` builds a throwaway project per failure mode and proves each gate still rejects what it claims to — with the same case-name set as api-node (§18 structural symmetry). The architecture profile itself is derived from `.proto-forge/facets.json` and re-derived on every run (`pnpm arch:verify`). See `package.json`, `AGENTS.md` and `docs/ARCHITECTURE.md`.
