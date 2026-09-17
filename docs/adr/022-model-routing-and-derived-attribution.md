# ADR 022: Every commit names its model by derivation, and every delegation is routed by price

- Status: accepted
- Date: 2026-09-17
- Prompt-log: docs/specs/2026-09-17-model-routing-and-attribution-design.md (stated by the operator: "the model that did the work is added to the commit as co-author automatically; proto-forge may use every available model, but when the default is GPT-6 Astra, Fable, Opus or stronger, the subagents come from the cheaper models — always the best model for the activity by output quality and price")

## Context

ADR 017 made the model a co-author of every commit and admitted its own limit:
`commit-lint` could prove a trailer's presence and shape, but not *which* model
prepared the commit — "a regex cannot verify model identity". The trailer was
typed by the model, which is the one party with an interest in getting it wrong
and no mechanism for getting it right: a model does not reliably know its own
id, and a hand-typed trailer can be omitted, mistyped, or attributed to a model
that was not there.

Separately, the pipeline had no position on *which* model does *what*. It ran
on whatever the operator opened the session with, and dispatched subagents on
whatever the harness defaulted to — usually the orchestrator's own model. With
frontier models at $10 in / $50 out per million tokens and economy models at a
tenth of that, a frontier orchestrator dispatching frontier subagents for
translation catalogues and screenshot runs pays frontier prices for work whose
quality gate (`i18n:verify`, `docs:verify`) does not care which model wrote it.
The operator's rule is explicit: a frontier default delegates to cheaper
tiers, and every activity runs on the best model for the money.

Claude Code reports the running model to hooks on `SessionStart` (`model`) and
on the model-switch events (`to_model`), and to nothing else; no environment
variable names it. The `Agent` tool takes a `model` parameter (an alias or a
full id). Those are the two seams this record builds on.

## Decision

**A model registry is the single source (NFR-31).** `references/models.json`
names every model the pipeline may run on — Anthropic's and OpenAI's current
generations — with its tier, its list price and read date, its aliases, and
the `Co-Authored-By` identity it signs with; the same file carries the routing
table. Three ranked tiers: `frontier` (input ≥ $5, output ≥ $25), `standard`,
`economy`. Every template ships a byte-identical copy at
`.proto-forge/models.json`, a protected path inside a generated repository;
`models:lint` proves the shape and the byte-identity, and that
`references/model-routing.md` documents every routed activity at the tier the
JSON routes it to.

**The trailer is derived, then verified (BR-46, amended).** A
`prepare-commit-msg` hook, `scripts/commit-coauthor.mjs`, appends the trailer
when the message has none, resolving the model from the `model:` field of the
prompt-log entry the `Prompt-Log:` trailer names, then `PROTO_FORGE_MODEL`,
then `.proto-forge/session.json` — the record `scripts/hooks/record-model.mjs`
writes on `SessionStart` and `PostModelSwitch`. No resolvable model aborts the
commit with the fix. `commit-lint` then fails a message whose cited entry
records a model that no trailer signs as. The limit ADR 017 stated moves from
"which model" (now verified against the entry) to "is the entry's
self-declaration true" (narrowed by the session record, closed by review).

**Delegation is routed, and a frontier orchestrator delegates downward
(BR-50).** Every prompt-log entry carries `model:`. A delegated entry carries
`delegated-by:` and `activity:`, and `prompt:lint` holds it to two rules: the
delegated tier is strictly below a frontier orchestrator's (no override), and
it is the tier the table routes the activity to unless `routing-override:`
records why. The skill reads the registry before its first dispatch and passes
the routed model to the `Agent` tool; decision-table row T25 states the same
as a fixed action.

## Consequences

Every app template gains `scripts/models.mjs` (the one reader of the registry),
`scripts/commit-coauthor.mjs`, `scripts/hooks/record-model.mjs`, a
`.husky/prepare-commit-msg` hook, two hook registrations in
`.claude/settings.json`, the registry copy, `.proto-forge/session.json` in its
`.gitignore`, and `.proto-forge/models.json` in `guardrails.protectedPaths`.
`prompt-log-lint.mjs` (three variants, one comment line apart) and the
byte-identical `commit-lint.mjs` learn the new checks; the shipped
`.prompts/0001-scaffold.md` (and `0002-desktop-shell.md`) entries record
`model: claude-fable-5-1`, the model that stamped them. Every template suite
grows ten prompt cases, three hook cases and — where a commit hook exists — six
commit cases; the plugin gains a twelve-case `models-lint` suite. The five
`api-*` templates byte-pin their gate corpus with the platform kernel, and the
`e2e` and `workspace` templates byte-pin `scripts/`, so their `seed.lock` files
are recut here — this record is the ADR that BRS §17.2 asks for. Snapshots
are regenerated in every template.

A generated repository's commit history now says, mechanically, which model
prepared each commit; its prompt log says which model ran each entry and, for
delegated entries, on whose behalf and for what. A cost policy that was a
sentence in a conversation is a gate.

## Alternatives considered

- **A `CLAUDE_CODE_SUBAGENT_MODEL` default instead of a routing table:** one
  cheaper model for every dispatch is the frontier rule with no routing — it
  sends `decision-record` work to the same model as `translation`. The table
  is what makes "best for the money" per activity checkable.
- **Reading the model from the harness on every commit:** Claude Code reports
  it only on session start and switch; a per-commit read does not exist, and
  a session record alone cannot say which model wrote a *given* entry. The
  entry's own field is the primary source for that reason.
- **Verifying the co-author against `git log` history of the session:** a
  regex over history proves nothing an entry cannot state more directly.
- **A model allowlist in `commit-lint` (rejected in ADR 017):** still
  rejected as an allowlist; the registry is a priced, routed catalogue with a
  reason per row, edited in one place and copied byte for byte.
