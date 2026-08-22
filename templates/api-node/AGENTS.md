# Working in this service prototype

Read before changing anything. These are not style preferences — each one is enforced by a gate that fails the build, and most are also enforced by a hook that blocks the edit.

Run `pnpm config:show` to see which gates are in force and whether any is currently waived.

**Two lanes.** `pnpm verify:fast` is the per-iteration bar — run it for every feature commit; it answers in minutes because the pinned gates run **in parallel** (`scripts/verify-fast.mjs`; `PROTO_FORGE_FAST_JOBS=1` for serial bisection). `pnpm verify` is the full bar — phase boundaries, release, CI. Never run the full suite between two feature commits. The fast chain is pinned (`FAST_GATES` in `scripts/config.mjs`) and `config:check` fails a drifted one.

**Fixes prove themselves.** A known defect is recorded the moment it is known (`gh issue create` when the repo has a remote; a `proposed` ADR otherwise), and its `fix:` commit must stage the regression test in the same diff — `commit-lint` refuses one that touches no test file. Reference the issue as `Fixes #N` in the body.

## The five rules that catch people out

**1. Every client-visible error is a registered problem type.** The catalogue in `src/platform/problems.ts` is the only error surface: `AppProblem` accepts only registered codes, every route declares the codes it can emit, and `docs/api/problems.md` documents each one. `pnpm error:catalog` fails an unregistered shape, a duplicate code, and a catalogue entry nothing can emit. Responses are RFC 9457 problem+json, English only — consumers key on `code`, a frontend translates FROM the catalogue.

**2. Every operation lives in the route registry with a `<resource>-<verb>` operationId.** One entry in `src/adapters/in/http/routes.ts` per operation: kebab-case id with at least one hyphen, unique across the app, zod schemas, problem list. The Fastify wiring, the OpenAPI contract, the docs examples and the conformance suite are all derived from that table — `pnpm opid:scan` fails a path literal registered anywhere else (only the byte-pinned kernel's `/healthz` and `/version` are outside the contract).

**3. Migrations are history.** Never edit or delete a file in `db/migrations/` — a correction is a NEW migration, and `.proto-forge/migrations.lock` pins every file's hash to prove it (`pnpm migration:verify`; `--write` appends new entries and refuses to re-pin). `DROP`/`TRUNCATE` need an `-- @adr NNN` marker. The Drizzle model must describe exactly the tables the migrations produce.

**4. The committed contract is a locked derivation of the code — and the running service serves it.** Never hand-edit `contract/openapi.json`: `pnpm contract:generate` regenerates it from the registry and re-pins `contract/contract.lock`; `pnpm contract:verify` byte-compares on every run. A breaking change against `contract/released/openapi.json` needs a contract major bump plus an ADR (`pnpm contract:breaking`). The same discipline covers docs: editing a handler invalidates its captured examples until `pnpm docs:examples` reruns. The platform serves `GET /openapi.json` (the committed bytes) and `GET /docs` — the owned explorer rendering the contract with the captured examples and curl usage; `contract:verify` fails a service whose explorer wiring is gone.

**5. Collections are paginated.** A GET whose 200 is a top-level array fails `contract:verify`; a GET embedding an array must declare `limit` + `offset` (or `cursor`) query parameters. Answer with the envelope (`items`, `total`, `limit`, `offset`) the demo slice ships — the repository port has no unpaged listing at all, so do not add one.

## What the hooks will stop

- editing anything under `src/platform/` — the kernel is byte-pinned (with `scripts/`) by sha256
- rewriting an existing `.prompts/` entry — the log is append-only; corrections are new entries
- hand-editing `.proto-forge/seed.lock` or `snapshot.json` — they are generated
- lowering a coverage threshold, a mutation floor, or a gate mode
- `--no-verify`, `git push --force` without a lease, `pnpm seed:lock`
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
| `pnpm arch:verify` | Re-derives the architecture style from the facets and proves the imports follow it |
| `pnpm opid:scan` · `pnpm error:catalog` | Structural invariants (fast; also run on every edit / at Stop) |
| `pnpm contract:verify` · `pnpm contract:breaking` | Spec drift + breaking-change policy |
| `pnpm contract:generate` | The only way the committed spec changes |
| `pnpm migration:verify` | Append-only migration ledger + model agreement (`--write` appends) |
| `pnpm docs:examples` · `pnpm docs:verify` | Capture / check API docs examples |
| `pnpm log:scan` · `pnpm deps:budget` | Structured-logging and dependency-surface floors |
| `pnpm db:migrate` | Apply migrations to `DATABASE_URL` (operator tool) |
| `pnpm test:e2e` | The conformance run: every harness scenario against the booted stack |
| `pnpm gates:selftest` | Proves each gate still rejects what it claims to |
| `pnpm doctor` | Fresh-machine pre-flight: toolchain pins, husky wiring, installed tree vs lockfile, stale mutation cache, port 3000, docker note, `.env` — every ✗ prints its fix |
| `pnpm heal` | Tiered self-healing for a red `verify`: mechanical regenerations first, a consent-gated agent pass second, escalation third — bounded, hard-stop gates excluded, every pass prompt-logged before it acts |
| `pnpm quality:report` · `pnpm status:verify` | Regenerate / verify the measured quality facts (`.proto-forge/quality.json` ≡ `docs/STATUS.md` ≡ the enforcing configs and contract) |
| `pnpm sync:jira` · `pnpm sync:confluence` | Show what *would* be sent. `--commit` to actually send; every sent object gets an MDX record in `docs/external/`. |
| `pnpm sync:pull --page <id> [--affects a,b]` | Fetch a Confluence page into a `pull` record. `affectedFiles` is yours to declare. |
| `pnpm sync:status [--fail-on-drift]` | Which external records changed upstream, and which local files that touches |
| `pnpm sync:auto` | Run after each accepted-ADR commit and at release. Sends live only for an integration with committed `autoPropagate: true` (+ enabled, `dryRun: false`, allowlisted host, credentials); otherwise stages and says why nothing was sent. |
| `pnpm external:verify` | Provenance of every record in `docs/external/` (part of `verify`) |
