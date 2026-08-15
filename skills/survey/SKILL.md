---
name: survey
description: "Use when the user wants to know what an EXISTING system actually contains before changing or rebuilding it — triggers on /survey, \"co máme k dispozici\", \"analyzuj existující systém\", \"co ten kód umí\", \"reverse engineer this codebase\", \"brownfield analysis\", \"inventory the API\", \"what does this service actually do\", \"audit what exists\". Reads a repository (optionally a schema dump or a committed OpenAPI document) and produces per API resource, entity, screen and job an English area document: a capability table where every row cites the file and line that proves it, an unknowns table naming what the code does NOT establish, and a stated confidence — observed or inferred — on every single row. Deterministic: the same pinned commit yields the same areas, ids, rows and evidence; only prose varies. It asks no questions by design — it emits survey.json, which the proto-forge discovery skill ingests as a pinned source so its existing SPIN/DAPA Q1–Q24 taxonomy generates the questions from real evidence instead of from a brief."
---

# survey

Turn a system that already runs into **an inventory somebody can argue with**:
what it demonstrably does, what it demonstrably does not settle, and which line
of which file proves each claim. Not documentation, and not a rewrite plan — the
evidence layer both of those need first.

**Governing rule (determinism).** Every generative decision traces to a row
S1–S9 of `references/survey-table.md`, or follows the escalation doctrine: the
most conservative reading, recorded as a proposal. The guarantee has the same
shape as the main skill's and discovery's — the same pinned commit yields the
same areas, ids, rows and evidence. Prose varies; nothing addressable does.

**This skill asks no questions.** The question surface already exists: discovery's
fixed Q1–Q24 taxonomy. A second catalogue of the same questions would drift
within one release — the exact failure the single-source rule exists to prevent —
so a survey records *unknowns* and hands them over (S5).

## When to use

The user has a system and wants to know what is in it: before a rebuild, before
an estimate, before onboarding, before a migration, or before asking a customer
anything. Runs standalone (the documents are the deliverable) or as the front end
of a discovery run over an existing system, which is the interesting case — see
"Feeding discovery" below.

Do **not** use it to plan a change, review code quality, or find bugs. It answers
"what is there", and stops.

## Inputs

A repository path. Optionally a database schema dump, a committed OpenAPI
document, and read access to a running instance's own metadata endpoints. None of
the optional inputs is required; each one that is absent degrades a specific
class of row to `inferred` rather than removing it (S9).

The output language is always English, whatever the sources are written in —
the same operator decision discovery records.

## The pipeline — S0 to S4, each step deterministic

### S0 — Intake

1. Choose the working directory: `./survey/` next to the repository, or
   `docs/survey/` inside it when it is a repository proto-forge generated (a
   `.proto-forge/` directory exists). **Copy this skill's `template/` into it
   byte-for-byte first**; every later step works inside that copy.
2. Pin the sources. Record the commit sha the survey reads (`git rev-parse HEAD`),
   and for every file a claim will later cite, its sha256. A survey that cannot
   name the commit it read is a survey of nothing in particular.
3. Delete the shipped sample (`docs/sample-area/` and the sample entries in
   `survey.json`) — it exists so the shipped template verifies itself, exactly
   like discovery's sample and the main template's demo.
4. Record what is skipped and why, per **S7**, into the run summary. Do this
   before deriving anything: coverage is a property of the run, and stating it
   afterwards invites stating it favourably.

### S1 — Derive the areas

Walk the tree in sorted path order and derive areas per **S1** — `api-area` from
route declarations, `entity` from migrations and models, `screen` from router
declarations, `job` from schedulers and consumers. Allocate ids per **S2**. Write
`survey.json`'s `areas[]`; its sha256 is the **survey identity** (`surveyHash`).

An area kind with no evidence is omitted, and its absence is stated in the
summary. "This system has no scheduled work" is a finding.

### S2 — Capabilities, with the line that proves each

For each area, fill the capability table per **S4**: one row per observable
behaviour, each citing `path:line` and carrying its confidence per **S6**.
Sort by evidence path then line, so the table's order is a property of the tree.

The discipline that makes this useful is refusing to write a row you cannot cite.
A capability nobody can point at is a belief about the system, and beliefs are
what a survey exists to replace.

### S3 — Unknowns, and their hand-off

Record what the code does not establish, per **S5**: the topic, the evidence of
absence, and the discovery question it maps to. Never a question, never a
recommendation — an unknown is an observation about the sources, phrased so the
person who answers it does not have to argue with a proposal first.

### S4 — One document per area, then the gate

Generate each area's English document from `references/document-template.md`
verbatim: pinned frontmatter, the capability table, the unknowns table, and the
coverage note stating what the run did not look at.

Then gate it: `node <dir>/.survey/lint.mjs <dir>` must exit 0 before the run is
reported as finished. The lint holds the properties prose cannot: every area in
`survey.json` has its document and vice versa, every row carries evidence and a
confidence value, every `q` names a question the discovery taxonomy actually
defines, and every cited path exists.

## Feeding discovery

A survey is most useful as discovery's source of truth about the present:

```
survey  →  survey.json  →  discovery  →  SPIN/DAPA documents + Q1–Q24 gaps
(what exists,             (units, and     (the questions, from the
 with evidence)            gaps from       existing taxonomy —
                           real code)      not rewritten here)
```

Point discovery at the survey directory. It treats `survey.json` as a pinned
source exactly like a Confluence export: areas become units, capability rows
become answered rows citing code evidence, and unknowns become open gaps citing
the evidence of absence. The questions stay discovery's; only where the evidence
comes from changes.

The one thing a survey adds that neither a brief nor a design file can: a gap of
the form **"the brief says X, the code does Y"**. When both a brief and a survey
are present, that contradiction is the most valuable row on the page, and the
brief wins the conflict — code describes what was built, not what should be.

## What this skill will not do

- **It will not ask the questions.** Discovery owns the taxonomy (S5).
- **It will not judge.** No quality scores, no severity, no "should". A survey
  that editorialises gets argued with instead of used.
- **It will not guess to fill a table.** An empty area is a finding; an invented
  row is a defect.
- **It will not write facets or touch the brief identity.** A brief states intent,
  a survey states what exists, and conflating the two would make the same brief
  hash differently depending on which codebase happened to be nearby.
