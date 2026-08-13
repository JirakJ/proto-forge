# ADR 200: Multi-environment delivery is one declaration, progressively enabled

- Status: accepted
- Date: 2026-08-13
- Prompt-log: .prompts/0001-scaffold.md

## Context

The prototype must be deployable through a real promotion chain — dev, sit, uat, test, prod — without the chain's description scattering across values files, workflow matrices, documentation tables and tribal memory. Scattered copies drift, and a drifted deploy surface fails at deploy time, in someone else's evening. At the same time, an early-phase project has exactly one remote environment and must not carry five environments' worth of ceremony to get there.

## Decision

The chain is declared **once**, in `.proto-forge/config.json` `environments{}` — an object with the fixed keys `local, dev, sit, uat, test, prod`, ordered by the `ENV_ORDER` constant in `scripts/config.mjs`. The promotion chain is the enabled subset of the remote keys, in that order (`promotionChain()`). Everything else is a derivation the `env:verify` gate holds in lockstep: a values file under `deploy/chart/values/` exists exactly for each enabled environment (both directions — missing and orphan both fail), and the environment table in `docs/DEPLOYMENT.md` is regenerated from the config, never hand-edited.

Enablement is **progressive**: the template ships with only `dev` enabled, and turning on a later environment is a reviewed config diff plus its values file. The CI workflows are **static** — committed files with config-driven skips — rather than generated matrices: a generated pipeline cannot be reviewed as a diff, and reviewing the pipeline is most of the point. `config:check` enforces the shape of the chain itself: `local` is not optional, an enabled environment names its cluster type and namespace, `prod` can never be the first enabled environment, and `prod` without required approval is an error.

## Consequences

"Which environments exist?" has one answer with one diff history. Enabling uat is visible in review as three lines of config and one values file, and the gate fails anything that pretends otherwise. The cost is a fixed vocabulary: a project wanting a `staging` key must map it onto the fixed chain, which is deliberate — a bespoke chain is exactly the drift this decision removes.

## Alternatives considered

Values files as the source of truth (inverts review: enabling prod would be "a file appeared", with no place for approval policy); generated workflows per enabled environment (unreviewable, and regeneration can silently change prod's pipeline); free-form environment names (every downstream consumer — CD plan, docs, approval mapping — would need its own validation vocabulary).
