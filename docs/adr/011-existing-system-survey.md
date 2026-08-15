# ADR 011: A survey states what an existing system contains; discovery keeps the questions

- Status: accepted
- Date: 2026-08-15
- Prompt-log: docs/specs/2026-08-13-v0.6.0-design.md (analytical front end, requested by the operator after the v0.7.0 templates landed)

## Context

Everything the plugin does starts from a brief. Phase 0 normalizes one into facets; the discovery skill (ADR 008) finds the holes in one before a build starts. Neither can say a word about a system that already exists — the words "brownfield", "legacy" and "existing codebase" appear nowhere in `SKILL.md` or `references/requirements.md`, and that is accurate rather than an oversight: the plugin was built for greenfield generation.

The operator asked for the analytical half — *look at what we have available* — and then for SPIN/DAPA questions derived from that analysis.

The second half already exists. `skills/discovery` is a SPIN/DAPA skill: it triggers on those very words, produces Situation/Problem/Implication/Need-payoff plus Definition/Acceptance criteria/Prerequisites/Assumptions per unit, and walks a fixed Q1–Q24 taxonomy that turns unanswered topics into open gaps with conservative defaults. Writing a second skill to do that would put two catalogues of the same questions in one repository, which drift within a release and then make two documents a customer signed disagree. That is precisely the single-source failure BR-15 exists to prevent.

What is genuinely missing is the *input*: discovery reads a brief, a Figma file and Confluence pages. It cannot read a codebase.

## Decision

A new skill, `survey`, answers one question — **what is actually in this system** — and hands the answer to discovery rather than acting on it.

**It produces evidence, not opinions.** Areas are derived by fixed rules from the tree (S1: API resources from route declarations, entities from migrations and models, screens from router declarations, jobs from schedulers). Every capability row cites `path:line`, and the file is sha256-pinned in the bridge. A row nobody can point at is not written.

**Every row states whether it was read or inferred** (S6). `observed` means a line says so; `inferred` means a competent reviewer would read it that way and an operator must confirm it. There is no third value, and no default. A survey that lets an inference look like an observation is worse than no survey — it launders a guess into a fact that later decisions rest on, and hides which rows were which.

**It asks no questions.** Where the code does not settle something, the survey records an *unknown*: the topic, the evidence of absence, and the id of the discovery question it maps to (S5). The taxonomy stays in one place. An unknown outside it carries `q: null` and still appears — visible and countable beats tidy.

**Coverage is stated, never implied** (S7). Skips are recorded with reasons before anything is derived, because "nothing was found in X" and "X was not looked at" are different sentences and only one is honest about what the run proved.

**The bridge is `survey.json`**, whose sha256 is the survey identity. Discovery ingests it as a pinned source exactly like a Confluence export: areas become units, capabilities become answered rows citing code, unknowns become open gaps. **The survey never writes facets and never touches the brief identity** — a brief states intent, a survey states what exists, and folding one into the other would make the same brief hash differently depending on which codebase happened to be nearby (BR-14 is untouched).

When both a brief and a survey are present, the contradiction row — *the brief says X, the code does Y* — is the most valuable output either could produce alone, and **the brief wins the conflict**: code describes what was built, not what should be.

The skill ships the same shape as its sibling: a decision table (S1–S9), a pinned document template, a self-verifying mini-template, and a standalone lint with its own selftest suite (12 cases) wired into `selftest-all` and the root verify chain.

## Consequences

The plugin gains a brownfield front end without a second question catalogue, and discovery gains a source of truth about the present it never had. The cost is one more skill to keep in step with the taxonomy: when a question is added to `questions.json`, S5's mapping table is where it must also land, and the survey lint deliberately validates only the *shape* of a question id rather than holding a copy of the catalogue — a second copy would be the drift this ADR exists to avoid.

The survey is honest about what it cannot do: it does not judge quality, propose changes, or estimate. Those need it as an input, which is the point.

## Alternatives considered

**A second SPIN/DAPA skill for existing systems**, as first requested — rejected: two catalogues of one taxonomy, and two skills competing for the same trigger words ("SPIN", "DAPA"), which makes both trigger less reliably. **Extending discovery to read code directly** — its pipeline is pinned around design and document sources, and a codebase reader inside it would make one skill responsible for both what exists and what is unclear; the seam between them is exactly where a reviewer wants to disagree. **Emitting facets from the survey** — would let a nearby repository change a brief's identity. **Scoring or severity on findings** — a survey that editorialises gets argued with instead of used; the ranking belongs to whoever reads it with their own priorities.
