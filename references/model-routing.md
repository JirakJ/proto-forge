# Model routing — which model does which activity, and why (BR-50)

The pipeline may run on any model the registry (`references/models.json`, NFR-31)
lists — Anthropic's or OpenAI's. Which model runs the *orchestrating* session is
the operator's choice. Which model runs a *delegated* activity is not a choice
made per dispatch: it is read from the routing table below, and `prompt:lint`
fails a delegated prompt-log entry whose model sits on a different tier.

## Tiers

| Tier | Rank | Price band (list, per million tokens) | Members (2026-09-17) |
| --- | --- | --- | --- |
| `frontier` | 3 | input ≥ $5, output ≥ $25 | Claude Fable 5.1, Claude Mythos 5.1, Claude Fable 5, Claude Opus 5, Claude Opus 4.8, GPT-6 Astra, GPT-5.5 |
| `standard` | 2 | input $1.5–5, output $8–25 | Claude Sonnet 5, Claude Sonnet 4.6, GPT-5.6 Sol, GPT-5.6 Terra, GPT-5.4 |
| `economy` | 1 | input < $1.5, output < $8 | Claude Haiku 4.5, GPT-5.6 Luna, GPT-5.4 mini, GPT-5.4 nano |

Tier membership is priced, not felt: a model moves between tiers by an edit to
the registry that changes its recorded price band, and `models:lint` keeps every
template's copy in step with the master.

## The two rules

1. **The frontier rule.** When the orchestrating entry's model is `frontier`,
   every entry it delegates runs on a strictly lower tier. There is no override
   for this rule; it is the operator's standing cost policy. A frontier
   orchestrator that needs frontier judgement for a step does that step itself.
2. **The routing rule.** A delegated entry's model is on the tier the table
   routes its activity to. Deviating is allowed only with a `routing-override:`
   reason in the entry's frontmatter — recorded provenance, not a bypass, and
   the frontier rule still applies above it.

## The routing table

| Activity | Tier | Why |
| --- | --- | --- |
| `brief-intake` | frontier | Phase 0 is the only interpretive step; a wrong facet is the most expensive error in the run |
| `decision-record` | frontier | ADRs and escalations are judgement, and they are read for the life of the repository |
| `scaffold-cleanup` | economy | Phase 1 is a fixed deletion and regeneration list |
| `codebase-search` | economy | Read-only exploration whose output is a location, not a judgement |
| `domain-model` | standard | Typed schemas from stated facets need care, not frontier reasoning |
| `adapter-build` | standard | A port implementation against a stated contract |
| `feature-build` | standard | The Phase 4 loop; the DoD and the fast lane catch what a standard model misses |
| `translation` | economy | Catalogue values with a lint that rejects every known failure mode |
| `a11y-pass` | standard | An axe finding needs a fix that keeps the component contract |
| `test-build` | standard | Behavioural tests against role and testid queries |
| `security-harden` | standard | Applying the baseline; a design choice escalates to `decision-record` |
| `documentation` | economy | Pages, gallery cases and screenshots from existing source |
| `gate-remediation` | standard | Bounded to two passes; the flagged line needs a correct fix the first time |
| `code-review` | standard | An independent read of a feature commit |
| `release` | standard | Changelog from the ADR set; mechanical steps with prose |

An activity a frontier orchestrator cannot delegate under the frontier rule
(`brief-intake`, `decision-record`) is one it performs itself — that is the
point of the row.

## How an entry states it

```md
---
id: 0012
timestamp: 2026-09-17T10:14:00Z
phase: 4
adr: 031
author: Jane Operator
model: claude-sonnet-5
delegated-by: 0011
activity: feature-build
---
```

`model` names a registered id or alias. `delegated-by` names the orchestrating
entry (an earlier id). `activity` names a table row. `routing-override: <reason>`
records a deliberate deviation from the routed tier.

## Where the model identity comes from

The orchestrating session reads its own model from `.proto-forge/session.json`,
which the `SessionStart` and `PostModelSwitch` hooks write when the harness
reports it (`scripts/hooks/record-model.mjs`), or from the `PROTO_FORGE_MODEL`
environment variable when the harness does not. The same two sources are the
fallbacks for the commit hook that derives the `Co-Authored-By` trailer
(`scripts/commit-coauthor.mjs`, BR-46) when the message names no prompt-log
entry yet — the entry's own `model:` field is always the first source.
