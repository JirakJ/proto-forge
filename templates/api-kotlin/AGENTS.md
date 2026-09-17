# Working in this service prototype

Read before changing anything. These are not style preferences — each one is enforced by a gate that fails the build, and most are also enforced by a hook that blocks the edit.

Run `pnpm config:show` to see which gates are in force and whether any is currently waived.

## The four rules that catch people out

**1. Every client-visible error is a registered problem type.** The catalogue in `src/main/kotlin/app/platform/Problems.kt` is the only error surface: `AppProblem` resolves only registered codes, every route declares the codes it can emit, and `docs/api/problems.md` documents each one. `pnpm error:catalog` fails an unregistered shape, a duplicate code, and a catalogue entry nothing can emit. Responses are RFC 9457 problem+json, English only — consumers key on `code`, a frontend translates FROM the catalogue.

**2. Every operation lives in the route registry with a `<resource>-<verb>` operationId.** One RouteDef in `src/main/kotlin/app/adapters/in/http/` per operation: kebab-case id with at least one hyphen, unique across the app, shapes, problem list. The Ktor wiring (RouteRegistrar), the OpenAPI contract, the docs examples and the conformance suite are all derived from that table — `pnpm opid:scan` fails a Ktor routing path literal (`get("/…")`, `route("/…")`, …) anywhere else (only the byte-pinned kernel's `/healthz`, `/version` and its tailcard fallback are outside the contract). Handlers are plain `OperationHandler` lambdas keyed by operationId; the registrar owns status, content type and the write.

**3. Migrations are history.** Never edit or delete a file in `src/main/resources/db/migration/` — a correction is a NEW `VNNNN__name.sql`, and `.proto-forge/migrations.lock` pins every file's hash to prove it (`pnpm migration:verify`; `--write` appends and refuses to re-pin). `DROP`/`TRUNCATE` need an `-- @adr NNN` marker. The JPA entities must describe exactly the tables the migrations produce; the native tier (`./gradlew nativeTest`, Docker) proves the full agreement with `flyway migrate` + `ddl-auto=validate`.

**4. The committed contract is a locked derivation of the code.** Never hand-edit `contract/openapi.json`: `pnpm contract:generate` regenerates it from the emit slice (`./gradlew contractEmit` — the route registry plus the domain descriptors, no server) through the shared normalizer and re-pins `contract/contract.lock`; `pnpm contract:verify` byte-compares on every run. A breaking change against `contract/released/openapi.json` needs a contract major bump plus an ADR (`pnpm contract:breaking`). The same discipline covers docs: editing a handler invalidates its captured examples until `pnpm docs:examples` reruns.

## Who did the work

Every commit's git author is the operator; the model that prepared it signs as co-author, and the trailer is **derived, not typed**. The `prepare-commit-msg` hook reads the `model:` field of the prompt-log entry your `Prompt-Log:` trailer names, looks it up in `.proto-forge/models.json` and appends `Co-Authored-By: <registered name> <email>`; `commit-lint` then refuses a trailer naming any other model. So: every `.prompts/` entry carries `model: <registered id or alias>` — read yours from `.proto-forge/session.json` (written by the `SessionStart` / `PostModelSwitch` hooks) or `PROTO_FORGE_MODEL`, never guess it.

When you dispatch a subagent, the entry you write for it *before* the dispatch also carries `delegated-by: <your entry id>` and `activity: <a key from the registry's routing table>`, and the subagent runs on the tier the table routes that activity to. A frontier-tier orchestrator (Claude Fable, Claude Opus, GPT-6 Astra, their peers) delegates only to a strictly cheaper tier — no override. A deliberate deviation from the routed tier records `routing-override: <reason>`. `prompt:lint` enforces all of it; the registry copy is a protected path, edited only in the plugin.

## What the hooks will stop

- editing anything under `src/main/kotlin/app/platform/` — the kernel is byte-pinned (with `scripts/`) by sha256
- rewriting an existing `.prompts/` entry — the log is append-only; corrections are new entries
- editing `.proto-forge/models.json` — the model registry is the plugin's single source (NFR-31)
- hand-editing `.proto-forge/seed.lock` or `snapshot.json` — they are generated
- lowering a JaCoCo minimum, the PIT floor (`mutationThreshold`), the PIT scope (`targetClasses`), or a gate mode
- `--no-verify`, `git push --force` without a lease, `pnpm seed:lock`, `gradlew -x test`, casual `--write-locks`
- network calls, unless `guardrails.network.allow` is on and the host is listed

## When a gate is genuinely wrong

Fix the code first — that is the answer roughly always. If the floor itself is wrong, write an ADR. To relax a **mandatory** gate (arch, contract, errors, migration, opid, docs, security, stub, consistency, snapshot, coverage, ignores, mutation, external, log, deps, env, deploy, status — the `MANDATORY_GATES` list in `scripts/config.mjs`) you also need a `waivers[]` entry in `.proto-forge/config.json` with a reason, that ADR, and an expiry date:

```json
{ "gate": "docs", "reason": "internal spike API for the October review", "adr": 150, "expires": "2026-10-31" }
```

Without a live waiver the setting is ignored and the gate runs at `error` anyway. With one, every `verify` prints the relaxation, and it ends by itself on the expiry date.

## When verify is red: `pnpm heal`

`pnpm heal` works a red `pnpm verify` in three bounded tiers. Tier 1 (default on, 2 passes) replays the deterministic regenerations from the healing registry — captured examples, the STATUS block, the committed spec (a locked derivation of the route registry; `contract:breaking` still gates majors) — derivations only, never a floor, a snapshot or a waiver. Tier 2 dispatches a bounded agent pass and runs **only** with `selfHealing.agent.enabled: true` in the committed config: committing that flag is the operator's standing, reviewed consent, exactly like `autoPropagate`. Tier 3 prints a blocked report and exits 1. Hard-stop gates (secrets, high/critical audit) never enter any tier, and every pass writes a `.prompts/` entry before it acts.

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
| `pnpm test:e2e` | The conformance run: every harness scenario against the Ktor test application |
| `./gradlew nativeTest` | The real-database tier: Testcontainers Postgres + flyway + ddl validate (needs Docker; CI runs it always) |
| `pnpm gates:selftest` | Tier 1: proves each gate still rejects what it claims to (fixture dirs, no JVM) |
| `pnpm gates:selftest:native` | Tier 2 (CI): throwaway Gradle builds prove ArchUnit, the JaCoCo rule and flyway validate fire |
| `pnpm doctor` | Fresh-machine pre-flight: toolchain pins (node, pnpm, JDK), husky wiring, installed tree vs lockfile, wrapper cache, stale mutation report, port 8080, docker note, `.env` — every ✗ prints its fix |
| `pnpm heal` | Tiered self-healing for a red `verify`: mechanical regenerations first, a consent-gated agent pass second, escalation third — bounded, hard-stop gates excluded, every pass prompt-logged before it acts |
| `pnpm quality:report` · `pnpm status:verify` | Regenerate / verify the measured quality facts (`.proto-forge/quality.json` ≡ `docs/STATUS.md` ≡ the enforcing configs and contract) |
| `pnpm sync:jira` · `pnpm sync:confluence` | Show what *would* be sent. `--commit` to actually send; every sent object gets an MDX record in `docs/external/`. |
| `pnpm sync:pull --page <id> [--affects a,b]` | Fetch a Confluence page into a `pull` record. `affectedFiles` is yours to declare. |
| `pnpm sync:status [--fail-on-drift]` | Which external records changed upstream, and which local files that touches |
| `pnpm sync:auto` | Run after each accepted-ADR commit and at release. Sends live only for an integration with committed `autoPropagate: true`; otherwise stages and says why nothing was sent. |
| `pnpm external:verify` | Provenance of every record in `docs/external/` (part of `verify`) |
