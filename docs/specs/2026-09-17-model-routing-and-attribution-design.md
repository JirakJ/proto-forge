# Model routing and automatic attribution — every commit names its model, every delegation is priced

- Date: 2026-09-17
- Register space: **§10** rule **BR-50**, **NFR-31**; amendment to **BR-46**; decision-table row **T25**; plugin ADR **022**
- Status: landed in every template the registry lists

## The operator's findings

Two gaps, verbatim in intent:

1. **Attribution is manual.** BR-46 requires a `Co-Authored-By` trailer naming
   the model that prepared the commit, and `commit-lint` fails a commit without
   one — but nothing *writes* it. The model types the trailer by hand, and the
   rule itself admits the limit: "which model prepared the commit is provenance
   the prompt log carries; a regex cannot verify model identity." The operator
   wants the trailer added automatically, and the identity it names verified.
2. **Delegation is unpriced.** The pipeline may run on any available model —
   Anthropic's or OpenAI's — and it dispatches subagents freely. Nothing says
   which model a delegated activity should run on. The operator's rule: when the
   default (orchestrating) model is frontier-tier — GPT-6 Astra, Claude Fable,
   Claude Opus, or stronger — every subagent runs on a cheaper tier; and in
   general each activity runs on the best model for that activity *by quality
   and price*, not by habit.

## Decisions (one ADR)

### D1 — A model registry is the single source of model identity and price (NFR-31)

`references/models.json` lists every model the pipeline may name: id, provider,
display name, aliases, tier, list price (input/output per million tokens, with
the date the price was read), and the co-author identity (`name <email>`) the
trailer uses. Three tiers, ranked: `frontier` (3), `standard` (2), `economy`
(1). The same file also carries the **routing table**: activity → tier, with the
reason. Every template ships a byte-identical copy at
`.proto-forge/models.json`, because the template's own gates need it at commit
time and a generated repository must not reach back into the plugin.

`models:lint` (plugin) proves the registry's shape — unique ids and aliases, a
known tier on every model, every tier populated, well-formed co-author email,
every routed activity documented in `references/model-routing.md` and vice
versa — and that every template copy is byte-identical to the master.

### D2 — The trailer is derived, then verified (BR-46, amended)

A `prepare-commit-msg` hook (`scripts/commit-coauthor.mjs`) appends
`Co-Authored-By: <name> <email>` when the message has no co-author trailer. The
identity comes, in order, from: the `model:` field of the prompt-log entry the
message's `Prompt-Log:` trailer names; the `PROTO_FORGE_MODEL` environment
variable; `.proto-forge/session.json`, which the `SessionStart` and
`PostModelSwitch` Claude Code hooks write (`scripts/hooks/record-model.mjs`)
whenever the harness reports the model. With no resolvable model the hook aborts
the commit and says what to set — silence is not an option.

`commit-lint` (the `commit-msg` half) closes the stated limit: when the named
prompt-log entry declares a model, the trailer set must contain that model's
registered identity. A trailer naming a different model than the entry that
produced the commit fails. Merge and squash commits are exempt from the derive
step; the verify step already skips messages the operator did not author
through the pipeline (`commit-lint` runs only on the pipeline's commits).

### D3 — Delegation is routed by activity, and a frontier orchestrator delegates downward (BR-50)

Every prompt-log entry names the model that executed it (`model:` in the
frontmatter — a registered id or alias). An entry written for a dispatched
subagent additionally carries `delegated-by: <id>` (the orchestrating entry)
and `activity: <key>` (a key from the routing table). `prompt:lint` enforces:

- the model is registered;
- a delegated entry names an earlier entry as its orchestrator and a routed
  activity;
- **the frontier rule** — when the orchestrating entry's model is `frontier`,
  the delegated model's tier is strictly lower. No override exists for this
  rule; it is the operator's cost policy;
- **the routing rule** — the delegated model's tier is the tier the table
  routes the activity to, unless the entry carries `routing-override:` with a
  reason. An override is recorded provenance, not a bypass: the frontier rule
  still applies above it.

`SKILL.md` gains the operating half: read `.proto-forge/models.json` before the
first dispatch, pass the routed model to the `Agent` tool's `model` parameter,
write the delegated entry before the dispatch, and never dispatch a frontier
subagent from a frontier orchestrator. The decision table gains T25 stating the
same as a fixed action.

### The routing table (initial)

| Activity | Tier | Why |
| --- | --- | --- |
| `brief-intake` | frontier | Phase 0 is the only interpretive step; a wrong facet is the most expensive error in the run |
| `decision-record` | frontier | ADRs and escalations are judgement, and they are read for the life of the repository |
| `scaffold-cleanup` | economy | Phase 1 is a fixed deletion and regeneration list |
| `codebase-search` | economy | Read-only exploration whose output is a location, not a judgement |
| `domain-model` | standard | Typed schemas from stated facets need care, not frontier reasoning |
| `adapter-build` | standard | A port implementation against a stated contract |
| `feature-build` | standard | The Phase 4 loop; the DoD and the fast lane catch what a standard model misses |
| `translation` | economy | Catalogue values with a lint that rejects the failure modes |
| `a11y-pass` | standard | axe findings need a fix that keeps the component contract |
| `test-build` | standard | Behavioural tests against role/testid queries |
| `security-harden` | standard | Applying the baseline; a design choice escalates to `decision-record` |
| `documentation` | economy | Pages, gallery cases and screenshots from existing source |
| `gate-remediation` | standard | Bounded to two passes; the flagged line needs a correct fix the first time |
| `code-review` | standard | An independent read of a feature commit |
| `release` | standard | Changelog from the ADR set; mechanical steps with prose |

Prices behind the tiers (list, per million tokens, read 2026-09-17): frontier
$5–10 in / $25–50 out (Claude Fable 5.1, Claude Mythos 5.1, Claude Fable 5,
Claude Opus 5, Claude Opus 4.8, GPT-6 Astra, GPT-5.5); standard $2–4 in /
$10–20 out (Claude Sonnet 5, Claude Sonnet 4.6, GPT-5.6 Sol, GPT-5.6 Terra,
GPT-5.4); economy ≤ $1 in / ≤ $5 out (Claude Haiku 4.5, GPT-5.6 Luna,
GPT-5.4 mini, GPT-5.4 nano). Tier membership is the registry's call, priced;
the operator moves a model between tiers by editing the registry, and the
plugin gate keeps every copy in step.

## Enforcement map

| Rule | Enforcer | Where |
| --- | --- | --- |
| NFR-31 registry shape and copies | `models:lint` | plugin |
| BR-46 (amended) derive | `scripts/commit-coauthor.mjs` via `prepare-commit-msg` | every template with a commit hook |
| BR-46 (amended) verify | `commit-lint` via `commit-msg` | every template with a commit hook |
| BR-50 model + routing | `prompt:lint` | every template |

Proof: three new commit cases, six new prompt cases per template suite; one
plugin suite for the registry.

## Out of scope

- Reading the model from the harness for *every* hook event: Claude Code
  reports it on `SessionStart` and the model-switch events only. The session
  record is a fallback, not the primary source; the prompt-log entry is.
- Verifying that the model named in a prompt-log entry is the model that
  actually ran: the entry is written by the model, and a registry cannot prove
  a self-declaration. The session record narrows the gap; review closes it.
- Live price lookup: prices are recorded with their read date, and a stale
  price is an operator edit, never a network call inside a gate (NFR-16).
