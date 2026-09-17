# Working in this service prototype

Read before changing anything. These are not style preferences — each one is enforced by a gate that fails the build, and most are also enforced by a hook that blocks the edit.

Run `pnpm config:show` to see which gates are in force and whether any is currently waived.

## The four rules that catch people out

**1. Every client-visible error is a registered problem type.** The catalogue in `src/App/Platform/Problems.cs` is the only error surface: `AppProblem`'s constructor accepts only registered codes, every route declares the codes it can emit, and `docs/api/problems.md` documents each one. `pnpm error:catalog` fails an unregistered shape, a duplicate code, and a catalogue entry nothing can emit. Responses are RFC 9457 problem+json, English only — consumers key on `code`, a frontend translates FROM the catalogue.

**2. Every operation lives in the route registry with a `<resource>-<verb>` operationId.** One `RouteDef` in `src/App/Adapters/In/Http/` per operation: kebab-case id with at least one hyphen, unique across the app, shapes, problem list. The minimal-API wiring (`RouteRegistrar`), the OpenAPI contract, the docs examples and the conformance suite are all derived from that table — `pnpm opid:scan` fails a `MapGet("/…")`-style path literal anywhere else (only the byte-pinned kernel's `/healthz` and `/version` are outside the contract). Handlers are literal-free delegates in one table keyed by operationId.

**3. Migrations are history.** Never edit or delete a file in `src/App/Adapters/Out/Persistence/Migrations/` — a correction is a NEW `<utc-timestamp>_<Name>.cs`, and `.proto-forge/migrations.lock` pins every file's hash to prove it (`pnpm migration:verify`; `--write` appends and refuses to re-pin). `DropTable`/`TRUNCATE` need an `// @adr NNN` marker. The EF entities must describe exactly the tables the migrations produce; the native tier (`pnpm test:native`, Docker) proves the full agreement with `Database.Migrate()` + `HasPendingModelChanges`.

**4. The committed contract is a locked derivation of the code.** Never hand-edit `contract/openapi.json`: `pnpm contract:generate` regenerates it from the emitter's console mode (`dotnet run --project src/App -- --emit-openapi`, no socket, no database) through the shared normalizer and re-pins `contract/contract.lock`; `pnpm contract:verify` byte-compares on every run. A breaking change against `contract/released/openapi.json` needs a contract major bump plus an ADR (`pnpm contract:breaking`). The same discipline covers docs: editing a handler invalidates its captured examples until `pnpm docs:examples` reruns.

## The two toolchains

The app is .NET (`global.json` pins the SDK band, `Directory.Build.props` the compiler contract, `packages.lock.json` the resolution, `.config/dotnet-tools.json` the local tools); the gates are Node (`pnpm`, the `.mjs` corpus every proto-forge template shares — BRS §18). All three lockfiles are committed and all three are the reproducibility contract: CI restores with `--locked-mode` and installs with `--frozen-lockfile`. .NET has no in-process Postgres engine, so `tests/App.Tests/Persistence` (the real-database tier) runs against a disposable Postgres container: tool-gated on docker locally, MANDATORY in CI (ADR 003 records this §15/§19 escape).

## Who did the work

Every commit's git author is the operator; the model that prepared it signs as co-author, and the trailer is **derived, not typed**. The `prepare-commit-msg` hook reads the `model:` field of the prompt-log entry your `Prompt-Log:` trailer names, looks it up in `.proto-forge/models.json` and appends `Co-Authored-By: <registered name> <email>`; `commit-lint` then refuses a trailer naming any other model. So: every `.prompts/` entry carries `model: <registered id or alias>` — read yours from `.proto-forge/session.json` (written by the `SessionStart` / `PostModelSwitch` hooks) or `PROTO_FORGE_MODEL`, never guess it.

When you dispatch a subagent, the entry you write for it *before* the dispatch also carries `delegated-by: <your entry id>` and `activity: <a key from the registry's routing table>`, and the subagent runs on the tier the table routes that activity to. A frontier-tier orchestrator (Claude Fable, Claude Opus, GPT-6 Astra, their peers) delegates only to a strictly cheaper tier — no override. A deliberate deviation from the routed tier records `routing-override: <reason>`. `prompt:lint` enforces all of it; the registry copy is a protected path, edited only in the plugin.

## What the hooks will stop

- editing anything under `src/App/Platform/` — the kernel is byte-pinned (with `scripts/`) by sha256
- rewriting an existing `.prompts/` entry — the log is append-only; corrections are new entries
- editing `.proto-forge/models.json` — the model registry is the plugin's single source (NFR-31)
- hand-editing `.proto-forge/seed.lock` or `snapshot.json` — they are generated
- lowering the coverlet `<Threshold>`, the Stryker `break` floor, the Stryker `mutate` scope, the duplication threshold, or a gate mode
- `--no-verify`, `git push --force` without a lease, `pnpm seed:lock`, a `dotnet test` that disables its coverage contract, `dotnet restore --force-evaluate`
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
| `pnpm arch:verify` | Re-derives the architecture style from the facets and proves the using directives follow it (toolchain-free; ArchUnitNET re-proves it against the compiled assembly in `test:unit`) |
| `pnpm opid:scan` · `pnpm error:catalog` | Structural invariants (fast; also run on every edit / at Stop) |
| `pnpm contract:verify` · `pnpm contract:breaking` | Spec drift + breaking-change policy |
| `pnpm contract:generate` | The only way the committed spec changes |
| `pnpm migration:verify` | Append-only migration ledger + model agreement (`--write` appends) |
| `pnpm docs:examples` · `pnpm docs:verify` | Capture / check API docs examples |
| `pnpm log:scan` · `pnpm deps:budget` | Structured-logging and dependency-surface floors |
| `pnpm db:migrate` | Apply migrations to `DATABASE_URL` (operator tool; EF Core via the app's `--migrate` mode) |
| `pnpm test:e2e` | The conformance run: every harness scenario against the in-memory test host |
| `pnpm test:mutation` | Stryker.NET over the behavioural core; break 85, scope Domain + Application |
| `pnpm test:native` | The real-database tier: a Postgres container + the committed history + the model-drift proof (needs Docker; CI runs it always) |
| `pnpm gates:selftest` | Tier 1: proves each gate still rejects what it claims to (fixture dirs, no dotnet) |
| `pnpm gates:selftest:native` | Tier 2 (CI): throwaway dotnet projects prove the native halves fire — ArchUnitNET, the coverlet `Threshold`, has-pending-model-changes |
| `pnpm doctor` | Fresh-machine pre-flight: toolchain pins (node, pnpm, the .NET SDK), the restored tool manifest, husky wiring, installed tree vs lockfile, a stale mutation report, port 8080, docker note, `.env` — every ✗ prints its fix |
| `pnpm heal` | Tiered self-healing for a red `verify`: mechanical regenerations first, a consent-gated agent pass second, escalation third — bounded, hard-stop gates excluded, every pass prompt-logged before it acts |
| `pnpm quality:report` · `pnpm status:verify` | Regenerate / verify the measured quality facts (`.proto-forge/quality.json` ≡ `docs/STATUS.md` ≡ the enforcing configs and contract) |
| `pnpm sync:jira` · `pnpm sync:confluence` | Show what *would* be sent. `--commit` to actually send; every sent object gets an MDX record in `docs/external/`. |
| `pnpm sync:pull --page <id> [--affects a,b]` | Fetch a Confluence page into a `pull` record. `affectedFiles` is yours to declare. |
| `pnpm sync:status [--fail-on-drift]` | Which external records changed upstream, and which local files that touches |
| `pnpm sync:auto` | Run after each accepted-ADR commit and at release. Sends live only for an integration with committed `autoPropagate: true`; otherwise stages and says why nothing was sent. |
| `pnpm external:verify` | Provenance of every record in `docs/external/` (part of `verify`) |
