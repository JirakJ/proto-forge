# Architecture

A Spring Boot 3.5 (Java 21) service with a complexity-derived architecture profile. Dependencies point inward; the import boundaries are enforced in the JVM build by ArchUnit (`src/test/java/app/arch/ArchitectureTest.java`) and re-proved standalone by `pnpm arch:verify`.

## Layers

| Layer | Path | May import | Purpose |
|---|---|---|---|
| domain | `src/main/java/app/domain/**` | domain, java, jakarta.validation | Pure entities: records + constraints (the shape's single source), repository ports. No I/O. |
| application | `src/main/java/app/application/**` | application, domain, platform, java, jakarta.validation | Use-case services orchestrating domain + ports; injected Clock and IdGenerator. |
| adapter-in | `src/main/java/app/adapter/in/**` | application, domain, platform, config (+ adapter-in outside the hexagonal profile) | The route REGISTRY (RouteRegistry/NoteRoutes), the registrar-driven Spring MVC wiring, the operation handlers. |
| adapter-out | `src/main/java/app/adapter/out/**` | application, domain, platform, config (+ adapter-out outside the hexagonal profile) | Spring Data JPA persistence implementing the ports. |
| platform | `src/main/java/app/platform/**` | platform (spring, slf4j, jakarta) | The byte-pinned kernel: problem catalogue + RFC 9457 advice, redacting AppLogger, security headers filter, health. |
| config | `src/main/java/app/config/**` | config (spring) | The AppProperties record — the single source of runtime configuration. |
| main | `src/main/java/app/*.java` | everything | Composition roots: Application (boot), Wiring (real clock/ids), MigrateMain (operator tool). |

## Profiles and derivation (ADR 005, BR-21)

The style is a pure function of `.proto-forge/facets.json` (decision table T15-T17): `X >= 3` external systems or broker messaging → **hexagonal**; else `C >= 2` entity-graph components or `E >= 8` entities → **modular**; else → **layered**. The result is recorded in `.proto-forge/architecture.json` `{style, inputs}`; the ArchUnit suite selects its edge table FROM that record, and `arch:verify` re-derives the style and re-proves the imports on every run without a JVM. This prototype derives **layered** from E=1, X=0, C=1.

## Single sources of truth (BRS §12.3)

- Runtime configuration → `app.config.AppProperties` (bound from `application.properties`, which is the only place the environment enters)
- Problem catalogue → `app.platform.Problems` (`PROBLEMS`)
- Route table → `app.adapter.in.web.RouteRegistry` (`ROUTES`)
- Domain shapes → the records + their jakarta-validation constraints (never hand-duplicated)
- The contract, docs examples and the conformance suite are all DERIVED from the route table

The consistency gate asserts no second definition of any of these exists.

## Governance

- **ADRs** in `docs/adr/` with in-code `// @adr NNN` anchors (the gate corpus counts as production code here); one accepted ADR = one commit.
- **Prompt log** in `.prompts/`, append-only.
- **Structure snapshot** in `.proto-forge/snapshot.json` proves structural determinism (BR-14); `.proto-forge/seed.lock` byte-pins the platform kernel AND the gate corpus as one digest.
- **Contract** (ADR 008): `contract/openapi.json` is a locked derivation emitted by the springdoc test slice and canonicalized by the shared normalizer; breaking changes require a contract major bump plus an ADR.
- **Migrations** (ADR 006): append-only Flyway history in `src/main/resources/db/migration/`, hash-pinned in `.proto-forge/migrations.lock`, executed against Testcontainers Postgres in the native tier.
- **Gates** are `pnpm` scripts; `pnpm verify` runs them all. See the root `package.json`.
