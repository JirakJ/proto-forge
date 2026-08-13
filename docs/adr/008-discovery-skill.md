# ADR 008: The discovery skill — a second skill, one register, one bridge

- Status: accepted
- Date: 2026-08-13
- Prompt-log: docs/specs/2026-08-13-v0.6.0-design.md (the v0.6.0 plan, pillar 3:
  discovery skill)

## Context

proto-forge turns a brief into a prototype, but the briefs that reach it are full of
holes: no error states, no permissions, no answer to "what does the customer actually
gain". Those holes get filled today at generation time by the escalation rule — one
conservative default at a time, deep inside a build. The operator wants the holes
found **first**, as a deliverable a customer can read and sign off: a gap analysis
per screen / feature / API area, with evidence, defaults, and pre-allocated
addressability, produced from a brief plus optional Figma and Confluence sources.

That is a different job with a different trigger vocabulary, so it must not bloat
the main skill's description or pipeline. It is also the plugin's first second
skill, which forces the question the single-skill era never asked: what is the
register of skills, and what holds their manifests together?

## Decision

**A second skill under `skills/discovery/`**, and `plugin/.claude-plugin/plugin.json`
`skills[]` becomes the single skills register. `scripts/skill-lint.mjs` generalizes
from "the root SKILL.md" to a loop over that register: every entry must resolve to a
SKILL.md + skill.json pair whose names agree, names are kebab-case and unique, a
non-root skill's directory basename is its name, every skill.json version equals the
root package.json version, and the description budget (60–1500) applies everywhere.
There is no silent root-only mode — a repo without the register fails the lint.

**A mini-template, copied per run** (`skills/discovery/template/`): a dependency-free
`.discovery/lint.mjs` (argv[2] = target directory), the fixed question taxonomy
`questions.json` (Q1–Q24), the bridge schema `discovery.schema.json`, and a
self-verifying sample unit the intake deletes — the main template's demo discipline
in miniature. The lint is one implementation with two call sites: the plugin's
`discovery:lint` gate runs it over the shipped sample, and every run's output is
held to the same bar by the same bytes. Its rules are BR-30–BR-33 in the register's
§10, and its deterministic core is `references/discovery-table.md` (D1–D9), whose
rows — like the decision table's — are a citation namespace `scripts/citations.mjs`
resolves, together with the Q-ids.

**A one-way bridge** (`discovery.json`), regenerated from the documents and never
hand-edited (BR-33): units, gap rows, reserved testids, and a facets prefill. The
main skill ingests it in Phase 0 — hash to the prompt log, fragment as the
normalization starting point, documents copied to `docs/discovery/**` — and honors
the testid reservations in Phase 4 (BR-31). **BR-14 stays untouched**: the facet
hash never includes discovery data; the brief wins every conflict; a conflict the
brief does not settle escalates. Discovery is provenance and prefill, never
identity.

**DAPA is reinterpreted for documents.** The classical DAPA framework is a live
conversation: define, agree, prove, accept. A generated document cannot converse,
so the acronym's letters map to what a document that must earn asynchronous
sign-off needs: Definition, Acceptance criteria, Prerequisites, Assumptions —
where Assumptions are the standing conservative defaults (D4) and sign-off is the
act of filling the Answer column (D9). The reinterpretation is recorded in the
skill's `references/document-template.md` rather than left as folklore. Documents
are always English, whatever the brief's language — an operator decision.

## Consequences

The plugin now installs two skills from one register, and adding a third is one
`skills[]` entry plus the tree it names — the lint demands the rest, mirroring what
ADR 007 did for templates. Discovery output is gate-checked to the same standard as
generated code: evidence-cited gaps (BR-30), deterministic addressability (BR-31),
pinned sources (BR-32), a bridge that cannot drift from its documents (BR-33). The
cost is a second manifest to bump on release and a second citation namespace to
maintain; both are enforced, not remembered.

## Alternatives considered

**Folding discovery into the main skill** — one description cannot carry two
trigger vocabularies without mis-triggering both ways, and the main pipeline's
phases would gain a mode switch in every step. **A standalone repository** — would
duplicate the citation machinery, the selftest harness and the release process for
a skill whose whole point is feeding this plugin's Phase 0. **Validating discovery
output by review instead of a lint** — review is exactly where "the picture is
probably current" and "the bridge probably matches" die; the main template's
history shows every such "probably" needed a gate. **Letting discovery write
facets.json directly** — would put a second author on the brief identity and break
BR-14's "the facets are the normalized brief"; a prefill the brief overrides keeps
one author and zero identity drift.
