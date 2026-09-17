# ADR 024: Delegation runs through subagent definitions pinned to their routed tier

- Status: accepted
- Date: 2026-09-17
- Prompt-log: docs/specs/2026-09-17-model-routing-and-attribution-design.md (the operator's rule, restated on the same day: "proto-forge may use every available model, but when the default is GPT-6 Astra, Fable, Opus or stronger, the subagents come from the cheaper models — always the best model for the activity by output quality and price")

## Context

ADR 022 made the routing policy *checkable*: every delegated prompt-log entry
names its model and activity, and `prompt:lint` fails a dispatch off its routed
tier or at a frontier orchestrator's own tier. It did not make the policy *hold*.
The dispatch itself still depended on the orchestrating model reading the table
and typing the right alias into the `Agent` tool's `model` parameter — the same
self-declaration problem BR-46 had with the co-author trailer, one step earlier.
A model that remembers the table wrong dispatches a frontier subagent, the entry
records it, the lint fails after the money is spent.

Claude Code resolves a subagent's model in a fixed order: a per-invocation
`model` parameter, then the definition's `model` frontmatter, then
`CLAUDE_CODE_SUBAGENT_MODEL`, then the parent's model. A definition under
`.claude/agents/` is therefore the seam where the routing table can be made
binding without the orchestrator's cooperation, as long as the dispatch passes
no `model` of its own.

## Decision

**Every delegable activity has a pinned definition (BR-51).** `references/agents/`
holds one `<activity>.md` per routing-table row whose tier is below the top
tier — thirteen today — with `name` equal to the activity, `model` an alias
that resolves in the registry to a model on exactly the routed tier (`sonnet`
for `standard`, `haiku` for `economy`), a tool allowlist fit for the activity
(read-only for `codebase-search` and `code-review`), and a system prompt that
binds the subagent to the template's `AGENTS.md`, its own scope, and an honest
report. The two frontier-routed activities, `brief-intake` and
`decision-record`, deliberately have no definition: a frontier orchestrator
performs them (the frontier rule), and a lower-tier orchestrator would pin them
below their route.

**Every template ships the set byte for byte.** `models:lint` proves the master
set — a definition per delegable activity, none for a frontier one, every pin
on its routed tier, every name its activity — and that each template's
`.claude/agents/` is the master, no more and no less.

**A dispatch names the activity and passes no model.** T25 and the skill's
routing section now say: `subagent_type: <activity>`, no `model` parameter.
Passing one is the routing-override case of BR-50, recorded as such; the
frontier rule still holds above it.

## Consequences

Routing becomes a property of the repository, not of the session: a fresh
session in a generated repository dispatches `translation` on Haiku and
`feature-build` on Sonnet whatever model it opened with, and `prompt:lint`
keeps the after-the-fact check. Codex and other harnesses without a subagent
definition format keep the BR-50 instruction path; the definitions cost them
nothing. Tier membership still moves only in the registry (NFR-31): the alias
`sonnet` follows whatever the registry says `sonnet` is.

## Alternatives considered

- **`CLAUDE_CODE_SUBAGENT_MODEL` in each template's `.claude/settings.json`:**
  one model for every dispatch, which is the frontier rule without routing —
  `code-review` and `translation` on the same tier. Rejected as in ADR 022.
- **Overriding the built-in `Explore` and `Plan` agents:** their names are not
  routing-table rows and their prompts are the harness's; `codebase-search` is
  the routed equivalent and keeps the table as the only vocabulary.
