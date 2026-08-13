# Working in this service prototype

Read before changing anything. These are not style preferences — each one is enforced by a gate that fails the build, and most are also enforced by a hook that blocks the edit.

Run `pnpm config:show` to see which gates are in force and whether any is currently waived.

## The four rules that catch people out

**1. Every client-visible error is a registered problem type.** The catalogue in `src/main/java/app/platform/Problems.java` is the only error surface: `AppProblem` resolves only registered codes, every route declares the codes it can emit, and `docs/api/problems.md` documents each one. `pnpm error:catalog` fails an unregistered shape, a duplicate code, and a catalogue entry nothing can emit. Responses are RFC 9457 problem+json, English only — consumers key on `code`, a frontend translates FROM the catalogue.

**2. Every operation lives in the route registry with a `<resource>-<verb>` operationId.** One RouteDef in `src/main/java/app/adapter/in/web/` per operation: kebab-case id with at least one hyphen, unique across the app, shapes, problem list. The Spring MVC wiring (RouteRegistrar), the OpenAPI contract, the docs examples and the conformance suite are all derived from that table — `pnpm opid:scan` fails a `@GetMapping`-style path literal anywhere else (only the byte-pinned kernel's `/healthz` and `/version` are outside the contract). Handlers are mapping-annotation-free `@RestController`s with one `handle(...)` method, keyed by operationId.

**3. Migrations are history.** Never edit or delete a file in `src/main/resources/db/migration/` — a correction is a NEW `VNNNN__name.sql`, and `.proto-forge/migrations.lock` pins every file's hash to prove it (`pnpm migration:verify`; `--write` appends and refuses to re-pin). `DROP`/`TRUNCATE` need an `-- @adr NNN` marker. The JPA entities must describe exactly the tables the migrations produce; the native tier (`./gradlew nativeTest`, Docker) proves the full agreement with `flyway migrate` + `ddl-auto=validate`.

**4. The committed contract is a locked derivation of the code.** Never hand-edit `contract/openapi.json`: `pnpm contract:generate` regenerates it from the springdoc test slice (`./gradlew contractEmit`, MockMvc, no socket) through the shared normalizer and re-pins `contract/contract.lock`; `pnpm contract:verify` byte-compares on every run. A breaking change against `contract/released/openapi.json` needs a contract major bump plus an ADR (`pnpm contract:breaking`). The same discipline covers docs: editing a handler invalidates its captured examples until `pnpm docs:examples` reruns.

## What the hooks will stop

- editing anything under `src/main/java/app/platform/` — the kernel is byte-pinned (with `scripts/`) by sha256
- rewriting an existing `.prompts/` entry — the log is append-only; corrections are new entries
- hand-editing `.proto-forge/seed.lock` or `snapshot.json` — they are generated
- lowering a JaCoCo minimum, the PIT floor (`mutationThreshold`), the PIT scope (`targetClasses`), or a gate mode
- `--no-verify`, `git push --force` without a lease, `pnpm seed:lock`, `gradlew -x test`, casual `--write-locks`
- network calls, unless `guardrails.network.allow` is on and the host is listed

## When a gate is genuinely wrong

Fix the code first — that is the answer roughly always. If the floor itself is wrong, write an ADR. To relax a **mandatory** gate (arch, contract, errors, migration, opid, docs, security, stub, consistency, snapshot, coverage, ignores, mutation, external, log, deps — the `MANDATORY_GATES` list in `scripts/config.mjs`) you also need a `waivers[]` entry in `.proto-forge/config.json` with a reason, that ADR, and an expiry date:

```json
{ "gate": "docs", "reason": "internal spike API for the October review", "adr": 150, "expires": "2026-10-31" }
```

Without a live waiver the setting is ignored and the gate runs at `error` anyway. With one, every `verify` prints the relaxation, and it ends by itself on the expiry date.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm verify` | Everything, fail-fast. This is the bar. |
| `pnpm config:show` | Gates in force, where each value came from, active waivers |
| `pnpm arch:verify` | Re-derives the architecture style from the facets and proves the imports follow it (JVM-free; ArchUnit re-proves it in `test:unit`) |
| `pnpm opid:scan` · `pnpm error:catalog` | Structural invariants (fast; also run on every edit / at Stop) |
| `pnpm contract:verify` · `pnpm contract:breaking` | Spec drift + breaking-change policy |
| `pnpm contract:generate` | The only way the committed spec changes |
| `pnpm migration:verify` | Append-only migration ledger + model agreement (`--write` appends) |
| `pnpm docs:examples` · `pnpm docs:verify` | Capture / check API docs examples |
| `pnpm log:scan` · `pnpm deps:budget` | Structured-logging and dependency-surface floors |
| `pnpm db:migrate` | Apply migrations to `DATABASE_URL` (operator tool; Flyway via `./gradlew dbMigrate`) |
| `pnpm test:e2e` | The conformance run: every harness scenario against the MockMvc slice |
| `./gradlew nativeTest` | The real-database tier: Testcontainers Postgres + flyway + ddl validate (needs Docker; CI runs it always) |
| `pnpm gates:selftest` | Tier 1: proves each gate still rejects what it claims to (fixture dirs, no JVM) |
| `pnpm gates:selftest:native` | Tier 2 (CI): throwaway Gradle builds prove ArchUnit, the JaCoCo rule and flyway validate fire |
| `pnpm sync:jira` · `pnpm sync:confluence` | Show what *would* be sent. `--commit` to actually send; every sent object gets an MDX record in `docs/external/`. |
| `pnpm sync:pull --page <id> [--affects a,b]` | Fetch a Confluence page into a `pull` record. `affectedFiles` is yours to declare. |
| `pnpm sync:status [--fail-on-drift]` | Which external records changed upstream, and which local files that touches |
| `pnpm sync:auto` | Run after each accepted-ADR commit and at release. Sends live only for an integration with committed `autoPropagate: true`; otherwise stages and says why nothing was sent. |
| `pnpm external:verify` | Provenance of every record in `docs/external/` (part of `verify`) |
