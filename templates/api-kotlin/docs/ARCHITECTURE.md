# Architecture

A Ktor 3 (Kotlin 2.2, JDK 21) service with a complexity-derived architecture profile. Dependencies point inward; the import boundaries are enforced in the JVM build by ArchUnit (`src/test/kotlin/app/arch/ArchitectureTest.kt`) and re-proved standalone by `pnpm arch:verify`.

## Layers

| Layer | Path | May import | Purpose |
|---|---|---|---|
| domain | `src/main/kotlin/app/domain/**` | domain, java, kotlin, kotlinx.serialization | Pure entities: data classes + their own `violations()` constraints (the shape's single source), hand-written `KSerializer`s (the wire schema), repository ports. No I/O. |
| application | `src/main/kotlin/app/application/**` | application, domain, platform, java, kotlin | Use-case services orchestrating domain + ports; injected Clock and IdGenerator. |
| adapter-in | `src/main/kotlin/app/adapters/in/**` | application, domain, platform, config (+ adapter-in outside the hexagonal profile) | The route REGISTRY (RouteRegistry/NoteRoutes), the registrar that installs it into Ktor routing, the operation handlers. |
| adapter-out | `src/main/kotlin/app/adapters/out/**` | application, domain, platform, config (+ adapter-out outside the hexagonal profile) | Exposed/HikariCP persistence implementing the ports, and the Flyway runner. |
| platform | `src/main/kotlin/app/platform/**` | platform (ktor, kotlinx, slf4j) | The byte-pinned kernel: problem catalogue + RFC 9457 StatusPages install, redacting AppLogger, security-headers plugin, health + the route-not-found fallback, the one `Json` codec. |
| config | `src/main/kotlin/app/config/**` | config (java, kotlin) | `Settings` — the single source of runtime configuration, read from the environment once. |
| main | `src/main/kotlin/app/*.kt` | everything | Composition roots: `Main` (boot), `Wiring` (`appModule`, the real clock/ids), `MigrateMain` (operator tool). |

## Profiles and derivation (ADR 005, BR-21)

The style is a pure function of `.proto-forge/facets.json` (decision table T15-T17): `X >= 3` external systems or broker messaging → **hexagonal**; else `C >= 2` entity-graph components or `E >= 8` entities → **modular**; else → **layered**. The result is recorded in `.proto-forge/architecture.json` `{style, inputs}`; the ArchUnit suite selects its edge table FROM that record, and `arch:verify` re-derives the style and re-proves the imports on every run without a JVM. This prototype derives **layered** from E=1, X=0, C=1.

Kotlin escapes the keyword segment in `app.adapters.\`in\`.http`; every gate strips the backticks before mapping a package to an element, so the escaping never leaks into a rule.

## Single sources of truth (BRS §12.3)

- Runtime configuration → `app.config.Settings` (`fromEnvironment` is the only reader of the environment; `logback.xml` reads `LOG_LEVEL` again only because a logging backend is configured before any Kotlin of ours runs)
- Problem catalogue → `app.platform.Problems` (`PROBLEMS`)
- Route table → `app.adapters.in.http.RouteRegistry` (`ROUTES`)
- Domain shapes → the data classes, their `violations()` and their `SerialDescriptor`s (never hand-duplicated)
- The contract, docs examples and the conformance suite are all DERIVED from the route table

The consistency gate asserts no second definition of any of these exists.

## Governance

- **ADRs** in `docs/adr/` with in-code `// @adr NNN` anchors (the gate corpus counts as production code here); one accepted ADR = one commit.
- **Prompt log** in `.prompts/`, append-only.
- **Structure snapshot** in `.proto-forge/snapshot.json` proves structural determinism (BR-14); `.proto-forge/seed.lock` byte-pins the platform kernel AND the gate corpus as one digest.
- **Contract** (ADR 008): `contract/openapi.json` is a locked derivation — the emitter walks the route registry and the domain's serialization descriptors with no server running — canonicalized by the shared normalizer; breaking changes require a contract major bump plus an ADR.
- **Migrations** (ADR 006): append-only Flyway history in `src/main/resources/db/migration/`, hash-pinned in `.proto-forge/migrations.lock`, executed against Testcontainers Postgres in the native tier.
- **Gates** are `pnpm` scripts; `pnpm verify` runs them all. See the root `package.json`.
