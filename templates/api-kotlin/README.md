# proto-forge service prototype (Kotlin / Ktor)

[![tests](https://img.shields.io/badge/tests-74%20passing-2f855a)](docs/STATUS.md)
[![core coverage](https://img.shields.io/badge/ -2f855a-2f855a)](docs/STATUS.md)
[![mutation score](https://img.shields.io/badge/mutation-100%25%20(42%2F42%2C%20break%2085)-2f855a)](docs/adr/003-test-strategy.md)
[![gates](https://img.shields.io/badge/verify%20gates-31-3182ce)](#what-this-template-gives-you)
[![contract](https://img.shields.io/badge/OpenAPI-derived%20%2B%20locked-3182ce)](contract/openapi.json)
[![stack](https://img.shields.io/badge/Kotlin%202.2%20%C2%B7%20Ktor%203-7f5af0)](docs/adr/001-tech-stack.md)

A production-grade Ktor service prototype scaffolded by the `proto-forge` skill. It builds with a checksum-pinned Gradle wrapper and locked dependencies, holds its behavioural core at 100 % JaCoCo coverage under PIT mutation testing, derives its own OpenAPI contract byte-identically from the route registry with no server running, proves persistence against a real Postgres in a Testcontainers tier, and passes architecture, error-catalogue, migration, documentation and security gates out of the box.

Every badge above is a number `pnpm verify` measured, not a claim: `quality:report` writes them into `.proto-forge/quality.json` and the `status` gate fails the build if this repo's documented numbers and its measured ones ever disagree. **The precise scope of the coverage badge is stated below — it is the enforced floor, not a whole-tree average.**

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

There is no in-memory database mode by design (BR-12/§15): a main run requires `DATABASE_URL`, while the whole verify pipeline runs socket-free on Ktor's `testApplication` over the fixture repository.

## What this template gives you

| Capability | What you get | Enforced by |
| --- | --- | --- |
| **Contract-first API** | `contract/openapi.json` derived from the route registry + kotlinx serialization descriptors — no server, no springdoc, no hand-editing — and pinned by sha256 in `contract.lock` | `contract:verify`, `contract:breaking` |
| **Addressable operations** | Every operation is one `RouteDef` with a unique kebab-case `<resource>-<verb>` id; paths exist nowhere else | `opid:scan` |
| **One error surface** | RFC 9457 `problem+json` from a registered catalogue; unmatched paths and methods included | `error:catalog` |
| **Architecture that stays true** | Style derived from the brief's facets, recorded, and re-proved every run by ArchUnit *and* a JVM-free import scan | `arch:verify` |
| **Total core coverage** | 1.00/1.00/1.00 instruction/branch/line on `app.domain` + `app.application` + `app.config`, with the config itself guarded | `test:unit`, `coverage:policy`, `ignores` |
| **Assertions that bite** | PIT mutation testing over the same core, floor 85, ratchet-only | `test:mutation` |
| **A real database, really** | Flyway history + a live catalog read-back + real SQL against Testcontainers Postgres | `./gradlew nativeTest` (CI-mandatory) |
| **Append-only schema history** | Every migration hash-pinned; a rewrite or deletion fails, `DROP` needs an ADR | `migration:verify` |
| **Docs that cannot go stale** | A page per operation with examples *captured* from real replays, invalidated the moment a handler changes | `docs:verify`, `docs:examples` |
| **Security baseline** | Strict headers on every response, redacting structured logging, no secrets in the tree, locked + audited dependencies | `sec:scan`, `log:scan`, `deps:budget` |
| **Reproducible builds** | Checksum-pinned Gradle wrapper, `gradle.lockfile`, `pnpm-lock.yaml`, pinned timezone and locale | `snapshot:diff`, seed integrity |
| **Multi-environment delivery** | One image promoted (never rebuilt) through a declared chain, signed and smoke-tested — see [Deploying](#deploying-github-actions-openshift-aks) | `deploy:verify`, `env:verify` |
| **Governance** | ADR ledger with in-code anchors, append-only prompt log, structure snapshot, one accepted ADR per commit | `adr:lint`, `prompt:lint`, `consistency` |
| **The gates are tested too** | Every gate has a demonstrated failure case; the native halves have their own CI-only tier | `gates:selftest`, `gates:selftest:native` |
| **Self-healing, bounded** | `pnpm heal` replays deterministic regenerations for a red gate; hard-stop gates never enter any tier | `pnpm heal`, `pnpm doctor` |

## Test suite and what "100 %" means here

| Tier | What it proves | Count |
| --- | --- | --- |
| unit (`app.domain`, `app.application`, `app.platform`, `app.config`) | behaviour, in isolation, at the enforced floor | 65 tests / 12 classes |
| slice (`testApplication`, no socket) | the real kernel, registrar and routes — headers, health, fallback, boundary rejections | included above |
| conformance (`test:e2e`) | all 9 harness scenarios replayed against the registry's own declarations | 9 scenarios |
| native (`./gradlew nativeTest`, Docker) | the Exposed adapter against real Postgres, plus schema/model agreement | CI-mandatory |

**The coverage badge is the enforced floor: 100 % instruction, branch and line on `app.domain` + `app.application` + `app.config`**, the packages that carry product logic — that is the scope `jacocoTestCoverageVerification` fails the build over, and it is at 100 % with **zero** `jacoco ignore` markers and no serialization-plugin exclusion (ADR 003 explains how that was earned rather than configured). The remaining tree is covered by the tier whose oracle actually fits it: the http adapter and platform kernel by the slice and conformance replays, the persistence adapter by the native tier (whose execution data merges into the same report wherever Docker exists), and the composition roots — `Main`, `MigrateMain` — by running the service, since a function whose job is to open a socket and a connection pool has no honest unit test. Those three exclusions are allow-listed **with their reason on the line above**, and `coverage:policy` fails any fourth.

**Stability is structural, not hopeful.** Nothing in the suite races, sleeps, binds a port or reaches the network: `testApplication` runs Ktor in memory, the clock is `Clock.fixed`, ids come from a counter, the fixture repository is reset per scenario, and `user.timezone`/`user.language`/`TZ` are pinned on every test task *and* in the PIT block — with `TimezonePinTest` failing loudly if that pin is ever dropped. The same inputs give the same bytes, which is why the captured docs examples and the emitted contract can be byte-compared at all.

## Deploying (GitHub Actions, OpenShift, AKS)

Delivery is GitHub Actions end to end, and the chain is **declared once** in `.proto-forge/config.json` under `environments{}` — values files, the docs table and the CD plan are all derived from it (`env:verify` fails the moment a copy drifts).

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `verify.yml` | every push and PR | the same `pnpm verify` you run locally, plus the two Docker-gated tiers (`nativeTest`, `gates:selftest:native`) |
| `package.yml` | green verify on `main`, and on tags | build → trivy scan → SBOM → push → `cosign sign` + SBOM attestation, keyless |
| `cd.yml` | after a package on `main` (dev), and on `v*` tags (the whole chain) | per environment: approval preflight → digest resolution → `cosign verify` → cluster login → `helm upgrade --install --atomic` → smoke test |
| `heal.yml` | after a red verify, with two committed consent doors | the mechanical heal tier only, proposed as a PR — never a push |

**Azure / AKS is a first-class target.** Set `environments.<env>.cluster.type: "aks"` and `auth.method: "oidc"`, and CD federates into Azure with `azure/login` using the client/tenant/subscription **names** your config declares (`auth.azureClientIdEnv`, `azureTenantIdEnv`, `azureSubscriptionIdEnv` — names only, never values), logs into ACR when the registry host ends in `.azurecr.io`, then runs `az aks get-credentials` + `kubelogin convert-kubeconfig -l azurecli` before Helm. The AKS environment additionally carries `AKS_CLUSTER_NAME` and `AKS_RESOURCE_GROUP` as GitHub environment variables, because `az` addresses a cluster by its ARM names. **OpenShift** (`cluster.type: "openshift"`, `auth.method: "token"`) logs in with `oc`, and exposure switches to a `Route` — `deploy:verify` cross-checks exposure against cluster type both ways, so a Route can never target AKS. Anything else uses a kubeconfig context.

`pnpm deploy:plan` prints what CD would do; `pnpm env:remote render --env <env>` stages an offline `helm template` for review, and `pnpm env:remote deploy --env <env> --commit --approve` replays exactly that through the consent doors. The full runbook — migrate-before-deploy, rollback, secrets contract, GitHub environment protection — is in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Layout

```
src/main/kotlin/app/
  domain/<entity>/     pure model: data classes + their own violations() (the
                       single source of shape), the hand-written wire schema
                       (NoteWire.kt), repository ports, no I/O
  application/         use-case services orchestrating domain + ports (injected
                       Clock + IdGenerator)
  adapters/in/http/    the route REGISTRY (RouteRegistry — operationIds, shapes,
                       problem lists), the registrar that installs it into Ktor
                       routing, the operation handlers
  adapters/out/persistence/  Exposed + HikariCP implementing the ports, Flyway
  platform/            the byte-pinned kernel: problem catalogue + RFC 9457
                       StatusPages, redacting AppLogger, security headers,
                       health + the route-not-found fallback, the one Json codec
                       — hashed into .proto-forge/seed.lock
  config/              Settings (single source of runtime configuration)
src/main/resources/db/migration/  append-only Flyway history (VNNNN__name.sql),
                       hash-pinned in migrations.lock
src/test/kotlin/
  app/…                unit suites, ArchUnit profile, conformance + capture + slice tests
  app/fixtures/        constraint-validated factories + the in-memory port fake
  app/harness/         scenario catalogue driving docs examples and the e2e run
  slices/              the test-application composition + the OpenAPI emitter
contract/              openapi.json (derived, locked) + released baseline
docs/adr/              ADR ledger (one accepted ADR = one commit)
docs/api/<opid>/       per-operation page + captured examples + .examples.lock
.prompts/              append-only prompt log
.proto-forge/          config + facets + architecture record + snapshot + locks + outbox
.claude/               hooks that block seed edits, threshold drops and gate bypasses
scripts/               the gate scripts (and their two-tier self-test)
```

## Where the decisions live

Every non-obvious choice in this template is an ADR with an in-code anchor. The three worth reading first: [ADR 001](docs/adr/001-tech-stack.md) (why Ktor and not Spring Boot), [ADR 003](docs/adr/003-test-strategy.md) (how the 100 % floor and the mutation score were earned on Kotlin bytecode rather than configured away — including the raw and filtered PIT numbers), and [ADR 008](docs/adr/008-contract-single-source.md) (how the contract is derived without a running server, and the two limits of that approach, stated rather than hidden).
