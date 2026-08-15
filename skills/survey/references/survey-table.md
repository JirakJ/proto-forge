# The survey decision table — S1 to S9

Every generative decision in a survey run traces to a row here. The rows are the
reason two runs over the same pinned commit produce the same areas, the same ids
and the same evidence — only prose varies. A situation no row covers is an
escalation, never an invention: state the most conservative reading as a
proposal and move on.

This is the existing-system analogue of `skills/discovery/references/discovery-table.md`.
Where that table derives units from a brief and a design file, this one derives
them from code that already runs.

---

## S1 — What an area is

An **area** is the smallest slice of an existing system a reviewer would discuss
in one sitting. Areas are derived, in this order, and the first rule that
produces a non-empty set wins for that kind:

| Kind | Derived from | Rule |
| --- | --- | --- |
| `api-area` | route registries, framework route declarations, an OpenAPI document if one is committed | one area per resource — the first path segment after any version prefix (`/v1/notes/{id}` → `notes`) |
| `entity` | migration files, ORM table/model declarations, schema dumps | one area per table or model; a join table with no model of its own belongs to the area of the table it is named after first |
| `screen` | router declarations in a UI tree (route path → component) | one area per route, excluding layout-only and redirect routes |
| `job` | scheduler declarations, queue consumers, cron manifests | one area per named job or consumer |

An area kind with no evidence in the tree is **omitted**, not emitted empty. A
system with no UI produces no `screen` areas, and that absence is itself a
finding worth stating in the run summary.

## S2 — Area ids

`<kind-prefix>-<slug>`, where the prefix is `api`, `ent`, `scr` or `job` and the
slug is the kebab-cased derived name (`notes`, `user-profile`). Collisions take
a `-n` suffix in **discovery order**: files walked in sorted path order, then
declarations in file order. Ids are the addressable surface of the survey — the
bridge, the documents and any question that cites an area all key on them, so
they are allocated once and never renamed within a run.

## S3 — Evidence, and what counts as it

Every claim in a survey cites **evidence that a reader can open**:
`path/to/file.ext:LINE` — plus the file's sha256 in `survey.json`. A claim with
no citable line is not a claim; it is an inference, and S6 governs how it is
labelled.

Three things are never evidence: a comment that describes intent rather than
behaviour, a test name (it states what someone hoped, not what ships), and a
README sentence. All three may be *quoted* as context, and all three are ranked
`inferred` at best.

## S4 — Capability rows: what the area demonstrably does

Each area's document carries a capability table, one row per observable
behaviour, derived by kind:

| Kind | A capability row is | Evidence |
| --- | --- | --- |
| `api-area` | one operation — method + path | the route declaration |
| `entity` | one persisted field, with its type and nullability | the migration or model line |
| `screen` | one user-visible interaction the component wires | the handler binding |
| `job` | one trigger and its effect | the schedule and the entry point |

Rows are sorted by evidence path then line, so the table's order is a property
of the tree rather than of the reading order.

## S5 — Unknowns: the hand-off to discovery

A survey **never asks questions**. It records what the code does not establish,
as an `unknown` row naming the topic and the evidence of absence (the file that
would have carried it, or the statement that no file does). The question surface
is `skills/discovery`'s fixed taxonomy Q1–Q24, and it is deliberately not
duplicated here: two catalogues of the same questions would drift within a
release, which is exactly the failure BR-15 exists to prevent.

The mapping is fixed, so a discovery run over a survey walks the same taxonomy it
walks over a brief:

| Unknown topic | Discovery question |
| --- | --- |
| no error path for an operation | Q1 |
| no empty/zero-row handling in a screen | Q2 |
| no authorization check on an operation | Q15 |
| no error contract (shape of a failure response) | Q16 |
| no pagination on a collection operation | Q17 |
| no idempotency handling on a non-GET operation | Q18 |
| a field that looks like personal data with no stated lifecycle | Q19 |
| an outbound call with no stated contract | Q20 |

A topic outside the table is recorded as an unknown with `q: null` — visible,
countable, and not silently dropped.

## S6 — Confidence, stated rather than implied

Every capability and unknown row carries one of two values, and there is no
third:

- **`observed`** — a line in the tree says so. The citation is that line.
- **`inferred`** — a reading a competent reviewer would reach from surrounding
  code, naming what it is inferred from. Anything an operator must verify before
  relying on it is `inferred`, including everything derived from a comment, a
  test name or a README.

A survey that labels an inference as observed is worse than no survey: it
launders a guess into a fact that later decisions rest on.

## S7 — What is skipped, and why it is stated

Skipped by default, each recorded once in the run summary with its reason:
dependency directories, build output, generated clients, vendored copies,
lockfiles, and anything the repository's own ignore rules exclude. Generated code
is skipped because surveying it measures a generator; vendored code because it
belongs to someone else's inventory.

A skip is never silent. "Nothing was found in X" and "X was not looked at" are
different sentences, and only one of them is honest about coverage.

## S8 — The bridge

`survey.json` is the machine half, and its shape is fixed so `skills/discovery`
can take it as a pinned source exactly like a Confluence export: `sources[]`
(path + sha256 + the commit the run pinned), `areas[]` (id, kind, doc,
capabilities counted, unknowns counted), `capabilities[]` and `unknowns[]` (each
with its evidence and confidence). Its sha256 is the **survey identity**
(`surveyHash`).

The survey never writes facets and never touches the facet hash: a brief states
intent, a survey states what exists, and BR-14's identity is a property of the
brief alone. When both are present, the brief wins every conflict — code
describes what was built, not what should be.

## S9 — Degradation, honestly

| Situation | Behaviour |
| --- | --- |
| no repository access | the run stops and says so; a survey with no sources is not a survey |
| partial access (one service of several) | proceed, and record every unreachable part in the summary as an explicit coverage gap |
| a language with no parser available | the area is still emitted from file and directory evidence, every row `inferred`, and the limitation stated in the summary |
| an empty repository | zero areas, and the summary says the tree carries no derivable area — never an invented one |
