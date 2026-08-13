# ADR 009: Architecture, contract, errors, migrations and docs are mandatory gates, and configuration cannot quietly waive them

- Status: accepted
- Date: 2026-08-13
- Prompt-log: .prompts/0001-scaffold.md

## Context

A service template's guarantees rot the same way the web template's did: each claim needs a gate that fails, or it is a comment. The backend claims are different — imports follow a derived architecture, the committed contract regenerates byte-identically, every error is registered, migrations are append-only, every endpoint carries a current captured example — but the failure mode is identical: without enforcement, each stays true for a week.

At the same time the pipeline is configurable — per-project gate settings, optional JIRA and Confluence integration. Configurability and enforcement pull in opposite directions: a config file that can turn off `contract` re-opens every hole this template closes.

## Decision

**The mandatory set** (the `MANDATORY_GATES` list in `scripts/config.mjs`): arch, contract, errors, migration, opid, docs, security, stub, consistency, snapshot, coverage, ignores, mutation, external, log, deps, env, deploy, status. Each is a `pnpm` script run by `verify`, fail-fast, identical locally and in CI, with the same names in the same order as api-node's (BRS §18 — the symmetry is what lets `citations` prove rule→enforcer across stacks mechanically).

**The gate corpus is Node, and the .NET toolchain sits behind seams.** The technology-neutral gates are the same dependency-free `.mjs` scripts as api-node's; the native toolchain does build, test, coverage, mutation and the ArchUnitNET suite through the `dotnet` CLI (`dotnet build` is both `lint` and `typecheck`, because `TreatWarningsAsErrors` makes the compiler the only opinion there is), and the three gates that need the running application — contract emission, example capture, the conformance run — spawn it themselves (`dotnet run -- --emit-openapi`, `dotnet test --filter Category=capture`, `dotnet test --filter Category=conformance`) behind documented `PROTO_FORGE_*` env seams, so the selftest proves each gate's discipline without a .NET project in the fixture. A generated repo therefore pins node+pnpm alongside its own toolchain (BRS §18; ADR 001) — the only npm packages are dev tools the gates shell out to or import.

**Configuration tightens freely and relaxes only on the record.** `.proto-forge/config.json` (merged over machine-wide defaults) sets gate modes, integration settings and guardrails. Relaxing a mandatory gate requires a `waivers[]` entry with a reason, an existing ADR and an expiry date. Without one, `config:check` fails **and the gate ignores the setting and runs at `error` anyway**. With one, the run is stamped `conformance: "waived"`, the relaxation is printed on every verify, and it expires by itself. A waiver for a gate that is not relaxed also fails, so the file cannot accumulate reassuring fiction.

**The gates are the product, so the gates get tested — in two tiers.** Tier 1 (`scripts/gates-selftest.mjs`, inside verify) builds a throwaway fixture project per failure mode and asserts each gate's exit code — including that an expired waiver stops disabling its gate — with the case-name set byte-identical to api-node's. Tier 2 (`scripts/gates-selftest-native.mjs`, CI-only) builds real throwaway .NET projects and proves the NATIVE halves fire: the ArchUnitNET rule, the coverlet threshold, and the EF Core model-agreement proof (ADR 003).

**Hooks guard what gates cannot.** `verify` catches a bad change after it is written; the Claude Code hooks in `.claude/settings.json` catch the class of change that should never be written — editing the byte-pinned platform kernel (`src/App/Platform/**`) or the gate corpus, rewriting a prompt-log entry, hand-editing a generated lock, lowering the coverlet `Threshold` or the Stryker break, narrowing the mutation scope, editing the architecture edge table, dropping a gate mode below `error`, `--no-verify`, a `dotnet test` run with its coverage contract disabled, `dotnet restore --force-evaluate`, un-allowlisted network calls. Both layers exist because an agent that can edit the rules can make any gate pass.

**Integrations are staged-first and consented.** No pipeline phase contacts JIRA or Confluence as a side effect: payloads land in `.proto-forge/outbox/`, and a live write additionally requires the integration enabled, `dryRun: false`, the host on the network allowlist, credentials from the environment, and consent — either a per-run `--approve` typed by the operator, or `autoPropagate: true` committed in the config as standing, reviewed consent for the unattended path (`pnpm sync:auto`, run after each accepted-ADR commit and at release). autoPropagate stands in for `--approve` and for nothing else.

## Consequences

An illegal import, a drifted spec, an invented error shape, a rewritten migration and an undocumented endpoint each fail the build, and `gates:selftest` demonstrates it rather than asserting it. The cost is ceremony at every boundary: routes need registry entries, errors need catalogue entries, migrations need to be new files, endpoints need captured examples — plus a second toolchain (node+pnpm) in a .NET repository. That ceremony is the deliverable.

## Alternatives considered

**Leaving gates free-form and only logging when one is off** — a single line of JSON quietly returns the build to green while shipping a drifted contract. **Freezing mandatory gates entirely** — a genuine pilot then has no path except deleting the gate, which is worse than an expiring, ADR-backed waiver. **Enforcing only in CI** — the hooks exist because the cheapest failure is the one blocked before it is written. **Porting the gate corpus to MSBuild targets or a C# tool project** — breaks the §18 symmetry that keeps citations, the selftest harness and the hook layer identical across every backend template.
