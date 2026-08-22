# ADR 015: Verification is two lanes, and the fast lane is pinned

- Status: accepted
- Date: 2026-08-22
- Prompt-log: docs/specs/2026-08-22-production-output-bar-design.md (stated by the operator: "verification gates take far too long — tests between iterations must be lightning fast, not one iteration taking six hours")

## Context

Every template ships one `pnpm verify`: gate selftests, lint, typecheck, unit
tests, mutation testing, build, budget, delivery surface, security scans, the
browser/e2e suite and the measured status — fail-fast, in one chain. SKILL.md's
commit discipline said a feature commit runs "scoped gates", and nothing defined
the scope. In practice a generating run reads "scoped" as "all", so every
feature iteration pays for mutation testing and the full browser suite, and one
iteration takes hours. A bar nobody can afford to run per iteration stops being
run per iteration — which is strictly worse than a lighter bar that is.

## Decision

**Two lanes, both named in `package.json` (BR-45).** `verify:fast` is the
per-iteration, per-feature-commit bar: unit tests with their coverage floors
plus every offline structural scan — the checks that answer in minutes and
catch what a feature commit can break. `verify` is unchanged and runs at each
phase boundary (end of Phases 4–8), before release, and in CI — never between
two feature commits.

**The fast chain is pinned, not conventional.** `FAST_GATES` in each template's
`scripts/config.mjs` is the single source; `config:check` fails a `verify:fast`
that drifts from the pin, and a fast gate the full chain does not also run. A
conventional lane would be quietly narrowed the first time it was red; a pinned
lane is a reviewed edit.

**The lane runs in parallel** (the operator's second finding: local tests may
run concurrently — the loop must move with no needless stalls). `verify:fast`
invokes `scripts/verify-fast.mjs`, byte-identical in every app template: it runs
`config:check` first and alone (it validates the config every other gate reads,
and the lane pin itself), then drives the remaining FAST_GATES through a worker
pool sized to the machine (`PROTO_FORGE_FAST_JOBS` overrides; `=1` is the serial
bisection mode). This is safe by construction: every fast gate is offline and
read-only over the tree except `test:unit`, whose `coverage/` output no other
fast gate reads. Output is buffered per gate and printed whole, so interleaving
never scrambles a report; the first red gate kills the pool and its full output
is the failure report. Wall clock becomes the slowest gate — in practice the
unit suite — instead of the sum of twenty. The package.json pin is therefore the
runner invocation (`node scripts/verify-fast.mjs`), and an inlined `&&` chain is
itself the drift `config:check` rejects: a hand-maintained chain is how a gate
falls out of the lane unreviewed.

What stays out of the fast lane, deliberately: `gates:selftest` (run after
editing a scan script, not per feature), `test:mutation` (proof depth, phase
boundary), `build`/`budget` (packaging), `env:verify`/`deploy:verify` (delivery
surface), `sec:scan`/`sec:conformance` (audit; the secret scan also runs as a
local hook), `test:e2e` (the browser/conformance pass), `quality:report`/
`status:verify` (derived from full-run artefacts). Every one of them still runs
at every phase gate and in CI.

## Consequences

An accepted ADR in history corresponds to a commit whose **fast-lane** gates
passed; the phase it belongs to does not close until the **full** chain is
green. The window between those two is bounded by a phase, which is the same
window CI already tolerated between local work and the pipeline's verdict.
`verify:fast` sits in every app template's `notAGate` (it is an aggregate, not
a gate); the pin itself is enforced by `config:check` and proven by three
selftest cases per template.

## Alternatives considered

- **Speed up the full chain instead** (incremental mutation, sharded e2e):
  helps, and Stryker's incremental cache already ships — but 90 % of the wall
  clock is proof depth a feature iteration does not need. Ordering cannot fix a
  scope problem.
- **Let the generator pick the scope per commit**: interpretive, so it decays
  under pressure exactly as "scoped gates" did. The lane must be mechanical.
- **Watch-mode-only inner loop**: leaves i18n/testid/layer/docs regressions
  undetected until the phase gate, where they arrive in bulk.
