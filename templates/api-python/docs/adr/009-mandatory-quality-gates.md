# ADR 009: Architecture, contract, errors, migrations and docs are mandatory gates, and configuration cannot quietly waive them

- Status: accepted
- Date: 2026-08-13
- Prompt-log: .prompts/0001-scaffold.md

## Context

A service template's guarantees rot the same way the web template's did: each claim needs a gate that fails, or it is a comment. The backend claims are different — imports follow a derived architecture, the committed contract regenerates byte-identically, every error is registered, migrations are append-only, every endpoint carries a current captured example — but the failure mode is identical: without enforcement, each stays true for a week.

At the same time the pipeline is configurable — per-project gate settings, optional JIRA and Confluence integration. Configurability and enforcement pull in opposite directions: a config file that can turn off `contract` re-opens every hole this template closes.

## Decision

**The mandatory set** (the `MANDATORY_GATES` list in `scripts/config.mjs`): arch, contract, errors, migration, opid, docs, security, stub, consistency, snapshot, coverage, ignores, mutation, external, log, deps. Each is a `pnpm` script run by `verify`, fail-fast, identical locally and in CI.

**The gate corpus is Node, the toolchain is Python.** Build/test/coverage/mutation/architecture run through uv (pytest, coverage.py, mutmut, mypy, ruff, import-linter, alembic); the gates that orchestrate them — and every technology-neutral gate — are the same `.mjs` scripts every proto-forge template carries, so this repo pins node+pnpm alongside uv (BRS §18). One gate framework is what keeps the selftest harness, the hook layer and cross-template symmetry working identically.

**Configuration tightens freely and relaxes only on the record.** `.proto-forge/config.json` (merged over machine-wide defaults) sets gate modes, integration settings and guardrails. Relaxing a mandatory gate requires a `waivers[]` entry with a reason, an existing ADR and an expiry date. Without one, `config:check` fails **and the gate ignores the setting and runs at `error` anyway**. With one, the run is stamped `conformance: "waived"`, the relaxation is printed on every verify, and it expires by itself. A waiver for a gate that is not relaxed also fails, so the file cannot accumulate reassuring fiction.

**The gates are the product, so the gates get tested — in two tiers.** Tier 1, `scripts/gates-selftest.mjs`, builds a throwaway fixture project per failure mode and asserts each gate's exit code — including that an expired waiver stops disabling its gate — with the SAME case-name set as every backend template (BRS §18). Gates that must spawn the python app (contract emission, example capture, the conformance run) carry a documented `PROTO_FORGE_*` env seam so the selftest proves the gate's discipline without a python environment in the fixture. Tier 2, `gates:selftest:native` (CI-only, BRS §19), builds real throwaway uv projects and proves the NATIVE gates fire: import-linter on an illegal import, the pytest coverage floor on an untested branch, `alembic check` against a real Postgres on a model the migrations do not produce.

**Hooks guard what gates cannot.** `verify` catches a bad change after it is written; the Claude Code hooks in `.claude/settings.json` catch the class of change that should never be written — editing the byte-pinned platform kernel or gate corpus, rewriting a prompt-log entry, lowering the coverage or mutation floor in pyproject.toml, `--no-verify`, un-allowlisted network calls. Both layers exist because an agent that can edit the rules can make any gate pass.

**Integrations are staged-first and consented.** No pipeline phase contacts JIRA or Confluence as a side effect: payloads land in `.proto-forge/outbox/`, and a live write additionally requires the integration enabled, `dryRun: false`, the host on the network allowlist, credentials from the environment, and consent — either a per-run `--approve` typed by the operator, or `autoPropagate: true` committed in the config as standing, reviewed consent for the unattended path (`pnpm sync:auto`, run after each accepted-ADR commit and at release). autoPropagate stands in for `--approve` and for nothing else.

## Consequences

An illegal import, a drifted spec, an invented error shape, a rewritten migration and an undocumented endpoint each fail the build, and the two selftest tiers demonstrate it rather than asserting it. The cost is ceremony at every boundary: routes need registry entries, errors need catalogue entries, migrations need to be new files, endpoints need captured examples — plus a second toolchain (node+pnpm) in a python repo. That ceremony is the deliverable.

## Alternatives considered

**Leaving gates free-form and only logging when one is off** — a single line of JSON quietly returns the build to green while shipping a drifted contract. **Freezing mandatory gates entirely** — a genuine pilot then has no path except deleting the gate, which is worse than an expiring, ADR-backed waiver. **Enforcing only in CI** — the hooks exist because the cheapest failure is the one blocked before it is written. **Porting the gate corpus to Python** — would fork the selftest harness and the citations machinery per stack; one corpus, two toolchains is the cheaper honesty (BRS §18).
