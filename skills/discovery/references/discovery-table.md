# Discovery decision table (the deterministic core, BRS §22)

Map pinned sources to fixed actions. Every generative decision the discovery skill
makes traces to a row here, exactly as the main pipeline's decisions trace to
`references/decision-table.md`. Anything uncovered follows the escalation doctrine
(BRS §11.1): the most conservative, most standard reading, recorded — never a guess
presented as fact.

| #   | WHEN                        | THEN (fixed action)                                                                                          | Emits                        |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| D1  | Sources ingested (intake done) | Derive units by fixed rules: every top-level Figma frame → one `screen` unit; every brief flow no frame covers → one `feature` unit; every entity or external system the sources give API intent → one `api-area` unit. Unit id = kebab slug of the frame / flow / entity name; unit order = Figma node order first, then brief statement order. Same sources → same units, same ids, same order. The inventory's sha256 is the discovery identity (`discoveryHash`). | `inventory.json`             |
| D2  | Per element of a unit       | Allocate `data-testid` = `<unit-id>-<slug(layer name)>`, falling back to the element's role when the layer name slugs to nothing; on collision, later elements append `-2`, `-3`… in node order. api-area operations: `api-<unit-id>-<verb>-<resource>` (the verb-resource half mirrors BR-25's operationId grammar). Grammar is `^[a-z0-9]+(-[a-z0-9]+)*$` — byte-identical to the web template's testid-scan. Full algorithm: `references/testid-derivation.md`. | Elements tables + `testids[]` |
| D3  | Per unit, per question of its kind band (screen Q1–Q8, feature Q9–Q12, api-area Q13–Q20; cross-cutting Q21–Q24 once per run, recorded in the first unit's gap table) | Classify from the pinned sources only: **answered** — the sources answer it, the row cites the evidence and carries the answer; **gap** — they do not, the row cites the evidence of absence and stays open; **omitted** — the topic is absent from every source and from the unit's kind, and the omission is deterministic (same sources → same omissions). | Gap table rows               |
| D4  | Per open gap                | Attach the most conservative, most standard default: the question's `defaultHint` specialized to the unit's evidence, stated as a proposal, never as fact. A default is what stands until the Answer cell overrides it — it is the Assumptions section's source of truth. | Proposed default cells       |
| D5  | Per unit, after D1–D4       | Generate the unit's document — always English, regardless of the brief's language — from `references/document-template.md` verbatim: pinned frontmatter, SPIN, DAPA (Definition / Acceptance criteria / Prerequisites / Assumptions), Elements, Gap table with empty Answer slots. Prose varies between runs; structure, ids, testids, question set and counts do not. | `docs/<unit>/README.md`      |
| D6  | After D5, and after every later edit | Run the copied `.discovery/lint.mjs <dir>` and remediate until it exits 0. It is the same implementation `discovery:lint` runs over the shipped sample, so a run's output is held to exactly the bar the plugin holds itself to (BR-30, BR-31, BR-32, BR-33). | gate                         |
| D7  | Documents green             | Regenerate `discovery.json` FROM the documents — one direction, never edited by hand: units with statuses and counts, `testids[]` reservations, `gaps[]`, and a `facets` prefill fragment holding only what the sources answered. The bridge never disagrees with the documents (BR-33). | `discovery.json`             |
| D8  | A generation run finds `discovery.json` next to its brief | The main skill's Phase 0 records `discoveryHash` in `.prompts/0003-discovery.md`, seeds facet normalization from the `facets` fragment (the brief wins every conflict; a conflict the brief does not settle escalates), and copies `discovery/docs/**` into the generated repo as `docs/discovery/**`. Phase 4 honors `testids[]` as reserved allocations (BR-31). BR-14 and the facet hash are untouched — provenance lives in the prompt log. | prompt-log entry             |
| D9  | Operator returns answers (`/discovery consolidate`) | Fill the Answer cells in the documents — append answers, never rewrite Evidence or Proposed default — flip each answered row's status, recompute `gapsOpen`/`gapsTotal` and the document status, re-run D6, then regenerate the bridge (D7). Consolidation never re-derives units, elements or testids: the reservations survive the answers. | updated docs + bridge        |

## The conservative-default doctrine (D4)

The main pipeline's escalation rule (BRS §11.1) picks the most conservative, most
standard option and records why. D4 is that rule applied to requirements instead of
code: a gap's proposed default is the option a reviewer would least object to, it is
visibly labelled a proposal, and it stands only until the customer's answer replaces
it. A default that smuggles in a product decision is the failure this row exists to
prevent.

## No Figma (the brief-only fallback)

Figma is never required. Without it, D1 derives no `screen` units — flows become
`feature` units and entities/external systems become `api-area` units; D2 allocates
testids from the nouns the brief names instead of layer names; every Image cell is
`—` with the stated reason that the run had no design source. Nothing else changes:
the same questions walk, the same defaults attach, the same lint gates the output.
