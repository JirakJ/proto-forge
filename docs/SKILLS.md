# Skill reference

The plugin registers four skills through `.claude-plugin/plugin.json`. Each
skill has a `SKILL.md` procedure, a `skill.json` manifest carrying the plugin
version, a `references/` folder with its own decision table, and, for the three
analysis skills, a `template/` mini-template that the skill copies byte-for-byte
before working. `skill:lint` checks registration, name uniqueness, frontmatter,
version agreement, and repository-local pointers.

## How the skills chain

```text
survey  --survey.json-->  discovery  --discovery.json-->  proto-forge
elicit  --completed evidence-->  discovery
```

- `survey` states what an existing system demonstrably contains.
- `elicit` produces the instrument that gets missing evidence out of a stakeholder.
- `discovery` turns evidence into a gap analysis with defaults and reserved testids.
- `proto-forge` turns a brief, optionally seeded by discovery, into repositories.

Only discovery feeds generation. Survey and elicitation output must pass through
discovery before it can influence facets, which keeps the facet hash a property of
the brief alone.

## `proto-forge` (main skill)

| Item | Value |
| --- | --- |
| Trigger | `/proto-forge`, "forge a prototype", "scaffold an app", "build a desktop app" |
| Input | A product brief; optionally `discovery.json` next to it |
| Rules | `SKILL.md`, `references/decision-table.md` rows T1–T24 |
| Output | One repository, or a workspace of separate repositories |
| Identity | `(facetsVersion, sha256(facets.json))` |
| Plugin gate | `citations`, `skill:lint`, `manifest:lint`, `template:integrity` |

See [Pipeline](PIPELINE.md) and [Usage guide](USAGE.md).

## `discovery`

| Item | Value |
| --- | --- |
| Trigger | `/discovery`, "gap analysis", "SPIN", "DAPA", "find the holes in the brief" |
| Input | A brief; optionally Figma links and Confluence exports; optionally `survey.json` |
| Rules | `skills/discovery/references/discovery-table.md` rows D1–D9 |
| Output | `docs/<unit>/README.md` per unit, `inventory.json`, `discovery.json` |
| Identity | `discoveryHash` = sha256 of `inventory.json` |
| Plugin gate | `discovery:lint` over the shipped sample |

Pipeline:

1. **D0 intake.** Copy the mini-template, copy inputs verbatim into `.inputs/` with
   SHA-256 pins, delete the shipped sample, derive units: Figma top-level frames
   become `screen` units, uncovered flows become `feature` units, entities and
   external systems with API intent become `api-area` units.
2. **D1 elements and testids.** Allocate `data-testid` per element as
   `<unit-id>-<slug(layer)>` with role fallback and `-n` collision suffixes; API
   operations use `api-<unit-id>-<verb>-<resource>`. The grammar is byte-identical
   to the web template's `testid:scan`, so the names are reservations the main
   skill honors in Phase 4.
3. **D2 gap detection.** Walk the fixed taxonomy in `.discovery/questions.json`:
   Q1–Q8 for screens, Q9–Q12 for features, Q13–Q20 for API areas, Q21–Q24 once per
   run. Each row is `answered` with evidence, an open `gap` with evidence of
   absence, or a deterministic omission.
4. **D3 documents.** One English SPIN/DAPA document per unit from the fixed
   template: pinned frontmatter, Elements table, gap table with a conservative
   proposed default and an empty Answer slot.
5. **D4 bridge.** After the lint passes, regenerate `discovery.json` from the
   documents: units with statuses and counts, `testids[]`, `gaps[]`, and a
   `facets` prefill fragment holding only what the sources answered.

`/discovery consolidate` fills Answer cells from stakeholder responses without
rewriting evidence or defaults, then regenerates the bridge. Figma is never
required; a brief-only run derives no screen units and marks every image cell
absent with a stated reason.

## `survey`

| Item | Value |
| --- | --- |
| Trigger | `/survey`, "what does this system actually do", "brownfield analysis" |
| Input | A repository path; optionally a schema dump, a committed OpenAPI document, running-instance metadata |
| Rules | `skills/survey/references/survey-table.md` rows S1–S9 |
| Output | One English area document per API resource, entity, screen, or job; `survey.json` |
| Identity | `surveyHash` = sha256 of `survey.json`; the read commit is pinned |
| Plugin gate | `survey:lint` over the shipped sample |

Rules that shape the output:

- Areas are derived in sorted path order from route registries, migrations and
  models, router declarations, and scheduler or consumer declarations. A kind with
  no evidence is omitted and its absence is stated in the run summary.
- Every capability row cites `path:line` plus the file's SHA-256. A claim with no
  citable line is an inference, not a capability.
- Every row carries exactly one confidence value, `observed` or `inferred`.
  Comments, test names, and README sentences rank `inferred` at best.
- The skill asks no questions. Unknowns map to discovery's Q1–Q24 taxonomy, or
  carry `q: null` when no question fits.
- Skipped paths (dependencies, build output, generated and vendored code) are
  listed with reasons so coverage is stated rather than implied.

The survey never writes facets. When both a brief and a survey exist, the brief
wins every conflict.

## `elicit`

| Item | Value |
| --- | --- |
| Trigger | `/elicit`, "how do I ask the customer", "discovery call", "onboarding questionnaire" |
| Input | Audience, engagement stage, whatever evidence exists |
| Rules | `skills/elicit/references/elicitation-table.md` rows E1–E9 |
| Output | An instrument document under `docs/`, `elicitation.json` |
| Plugin gate | `elicit:lint` over the shipped sample |

Instrument ladder, ordered by signal per unit of customer effort: artifact-first
draft, asynchronous voice or video prompt, diagnostic that returns a benchmarked
mini-audit, structured SPIN or JTBD interview, observation, and telemetry through
a survey run. For a cold prospect the sequence is diagnostic, then voice, then
artifact.

Hard rules enforced by the lint:

- an artifact-first draft carries at least three visibly provisional gaps;
- a diagnostic has non-empty findings, each with a benchmark;
- a voice prompt asks exactly one question and has no text field;
- a document whose question lines outnumber its content lines is a form and fails;
- one document is one instrument.

Completed elicitation evidence flows into discovery; it never reaches code
generation directly.

## Mini-template contract

Each analysis skill ships a self-verifying sample (`docs/sample-*`) and a lint under
a dot-directory (`.discovery/lint.mjs`, `.survey/lint.mjs`, `.elicit/lint.mjs`). The
skill copies the whole template, deletes the sample, and runs the same lint over
its own output. The plugin runs the same lint over the shipped sample in root
`verify`, so the plugin holds itself to the bar it imposes on runs.

## Related pages

- [Usage guide](USAGE.md) for choosing a workflow.
- [Development guide](DEVELOPMENT.md) for changing a skill or a mini-template.
