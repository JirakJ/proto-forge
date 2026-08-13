# Architecture

A .NET 10 minimal-API service (C#, `net10.0`) with a complexity-derived architecture profile. Dependencies point inward; the import boundaries are enforced in the dotnet build by ArchUnitNET (`tests/App.Tests/Arch/ArchitectureTest.cs`) and re-proved standalone by `pnpm arch:verify`.

## Layers

| Layer | Path | May import | Purpose |
|---|---|---|---|
| domain | `src/App/Domain/**` | domain, System (DataAnnotations included) | Pure entities: records + constraints (the shape's single source), repository ports. No I/O. |
| application | `src/App/Application/**` | application, domain, platform, System | Use-case services orchestrating domain + ports; injected TimeProvider and IIdGenerator. |
| adapter-in | `src/App/Adapters/In/**` | application, domain, platform, config (+ adapter-in outside the hexagonal profile) | The route REGISTRY (RouteRegistry/NoteRoutes), the registrar-driven minimal-API wiring, the operation handlers, the OpenAPI emitter. |
| adapter-out | `src/App/Adapters/Out/**` | application, domain, platform, config (+ adapter-out outside the hexagonal profile) | EF Core + Npgsql persistence implementing the ports, and the migration history. |
| platform | `src/App/Platform/**` | platform (System, Microsoft) | The byte-pinned kernel: problem catalogue + RFC 9457 middleware, redacting AppLogger, security-headers middleware, health. |
| config | `src/App/Config/**` | config (System) | The AppOptions record — the single source of runtime configuration. |
| main | `src/App/Program.cs` | everything | Composition root: the host wiring (real TimeProvider and id source) plus the `--emit-openapi` and `--migrate` console modes. |

## Profiles and derivation (ADR 005, BR-21)

The style is a pure function of `.proto-forge/facets.json` (decision table T15-T17): `X >= 3` external systems or broker messaging → **hexagonal**; else `C >= 2` entity-graph components or `E >= 8` entities → **modular**; else → **layered**. The result is recorded in `.proto-forge/architecture.json` `{style, inputs}`; the ArchUnitNET suite selects its edge table FROM that record, and `arch:verify` re-derives the style and re-proves the imports on every run without a dotnet toolchain. This prototype derives **layered** from E=1, X=0, C=1.

## Single sources of truth (BRS §12.3)

- Runtime configuration → `App.Config.AppOptions` (`FromEnvironment`, the only place the environment enters)
- Problem catalogue → `App.Platform.Problems` (`PROBLEMS`)
- Route table → `App.Adapters.In.Http.RouteRegistry` (`ROUTES`)
- Domain shapes → the records + their DataAnnotations constraints (never hand-duplicated)
- The contract, docs examples and the conformance suite are all DERIVED from the route table

The consistency gate asserts no second definition of any of these exists.

## Governance

- **ADRs** in `docs/adr/` with in-code `// @adr NNN` anchors (the gate corpus counts as production code here); one accepted ADR = one commit.
- **Prompt log** in `.prompts/`, append-only.
- **Structure snapshot** in `.proto-forge/snapshot.json` proves structural determinism (BR-14); `.proto-forge/seed.lock` byte-pins the platform kernel AND the gate corpus as one digest.
- **Contract** (ADR 008): `contract/openapi.json` is a locked derivation emitted by the app's own `--emit-openapi` console mode and canonicalized by the shared normalizer; breaking changes require a contract major bump plus an ADR.
- **Migrations** (ADR 006): append-only EF Core history in `src/App/Adapters/Out/Persistence/Migrations/`, hash-pinned in `.proto-forge/migrations.lock`, executed against a real Postgres container in the native tier.
- **Gates** are `pnpm` scripts; `pnpm verify` runs them all. The gate corpus is Node (BRS §18) while the app toolchain is the pinned .NET SDK. See the root `package.json`.
