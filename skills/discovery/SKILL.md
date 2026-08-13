---
name: discovery
description: "Use when the user wants a requirements gap analysis before building — triggers on /discovery, \"gap analysis\", \"gap analýza\", \"SPIN\", \"DAPA\", \"co zákazník vlastně chce\", \"najdi díry v zadání\", \"prepare discovery questions\", \"analyze the Figma for gaps\", \"what does the customer actually want\". Takes a product brief plus optional Figma links and Confluence pages, and produces per screen / feature / API area an English gap-analysis document (SPIN + DAPA: Definition, Acceptance criteria, Prerequisites, Assumptions) with an Elements table, sha256-pinned screenshots, and a gap table where every gap names its element, cites its evidence and carries a conservative default beside an empty Answer slot — plus a discovery.json bridge (units, gaps, pre-allocated data-testids, a facets prefill) that the proto-forge main skill ingests in Phase 0 and honors in Phase 4. Deterministic: the same sources yield the same units, ids, testids and questions; only prose varies. Figma is never required — a brief-only run degrades honestly. Documents are always English regardless of the brief's language. Re-run in consolidate mode to flow customer answers back into the documents and the bridge."
---

# discovery

Turn a brief — and whatever design or wiki material exists — into a **gap analysis
the customer can sign off**: one document per unit of work saying what the sources
actually establish, what they leave open, and what will be assumed until someone
answers. Not a questionnaire; an analysis with slots.

**Governing rule (determinism).** Every generative decision traces to a row
D1–D9 of `references/discovery-table.md`, or follows the escalation doctrine
(BRS §11.1): the most conservative, most standard reading, recorded as a proposal.
The guarantee is the same shape as the main skill's (BRS §8, restated for discovery
in BRS §22): the same pinned sources yield the same units, ids, testids, question
walk and table shapes. Prose inside the sections varies; nothing addressable does.

## When to use

The user wants to find the holes in a specification before building: gap analysis of
a brief, a Figma file, or Confluence pages; SPIN/DAPA discovery documents; questions
to send a customer; pre-allocated testids for a build that has not started. Runs
standalone (its output is the deliverable) or as the front end of a `proto-forge`
generation run (its output is ingested in Phase 0, D8).

## Inputs

A product brief (one paragraph is enough). Optionally: Figma links and Confluence
page references. **Figma is never required** — see the brief-only fallback in
`references/figma-contract.md`. The output language is always English, whatever the
input language (operator decision, ADR 008).

## The pipeline — D0 to D4, each step deterministic

### D0 — Intake

1. Choose the working directory: `./discovery/` next to the brief — or, when run
   inside a repo the main skill generated (a `.proto-forge/` directory exists),
   `docs/discovery/` inside it. **Copy the mini-template `template/` from this skill
   into it byte-for-byte first**; every later step works inside that copy.
2. Copy every input verbatim into `.inputs/` (the brief as `.inputs/brief.md`;
   Confluence exports as given). Record each input's sha256 — these become the
   `sources` pins (BR-32).
3. Delete the shipped sample (`docs/sample-screen/` and the sample entries in
   `inventory.json` / `discovery.json`) — it exists so the shipped template is
   self-verifying, exactly like the main template's demo.
4. Derive the unit inventory per **D1**: Figma top-level frames → `screen` units;
   brief flows no frame covers → `feature` units; entities and external systems with
   API intent → `api-area` units. Write `inventory.json`; its sha256 is the
   **discovery identity** (`discoveryHash`), the analogue of the facet hash — but it
   never enters the facet hash itself (BR-14 is untouched).

### D1 — Elements and testids

For each unit, list its elements: from Figma `get_metadata` (screen units), from the
flow's named interaction points (feature units), or from the operations the sources
imply (api-area units). Allocate every element's `data-testid` per **D2** —
`<unit-id>-<slug(layer)>` with role fallback and `-n` collision suffixes by node
order; `api-<unit-id>-<verb>-<resource>` for operations. The full algorithm and
worked examples are in `references/testid-derivation.md`; the grammar is
byte-identical to the web template's `testid:scan` (BR-02), because these names are
**reservations** the main skill's Phase 4 will honor (BR-31).

Capture screenshots per `references/figma-contract.md`: `get_screenshot` per frame or
group, bytes written under `docs/<unit>/images/`, sha256 recorded in `images.lock`
with the `fileKey` / `nodeId` / `fileVersion` pins. An element without an image gets
`—` and a stated `<!-- no-image: reason -->`.

### D2 — Gap detection

Walk the fixed question taxonomy in `.discovery/questions.json` per **D3**: screen
units answer Q1–Q8 (error, empty, loading, permissions, validation, destructive
confirm, content/i18n, overflow), feature units Q9–Q12 (actor+trigger, success,
failure/abandon, side effects), api-area units Q13–Q20 (endpoints, ownership,
authn/z, error contract, pagination, idempotency, lifecycle/PII, integration
contract), and Q21–Q24 (business value, rollout, locales, offline/realtime) once per
run in the first unit's table. A question the sources answer becomes an **answered**
row citing its evidence; one they do not becomes an **open** gap citing the evidence
of absence; a topic absent from every source is omitted, deterministically. Every
open gap gets its conservative default per **D4** — a proposal a reviewer would
least object to, never a smuggled product decision.

### D3 — One document per unit

Generate each unit's English document from `references/document-template.md`
verbatim (**D5**): pinned frontmatter, SPIN (Situation with evidence / Problem /
Implication tied to gap numbers / Need-payoff — what the customer actually gains),
DAPA (Definition / Acceptance criteria / Prerequisites / Assumptions — the
document-form reinterpretation explained in that reference: sign-off happens by
filling the Answer column, and Assumptions restate the standing defaults), the
Elements table, and the eight-column Gap table with empty Answer slots.

Then gate it (**D6**): `node <dir>/.discovery/lint.mjs <dir>` must exit 0 before
anything is handed off. It is the same implementation the plugin's `discovery:lint`
runs over the shipped sample, enforcing BR-30 (every gap names its element, its
evidence and its default), BR-31 (testid grammar + uniqueness), BR-32 (pinned
sources and images) and BR-33 (bridge parity).

### D4 — The bridge

Regenerate `discovery.json` from the documents per **D7** — one direction, never
hand-edited: units with statuses and recomputed counts, the `testids[]`
reservations, the `gaps[]` rows, and a `facets` prefill fragment holding **only**
facets the sources actually answered (a named locale, a stated persistence intent —
never an inferred one). The shape is `.discovery/discovery.schema.json`.

## Handoff to the main skill (D8)

When a `proto-forge` generation run finds `discovery/discovery.json` (or
`docs/discovery/discovery.json`) next to its brief, its Phase 0 records the
`discoveryHash` in `.prompts/0003-discovery.md`, seeds facet normalization from the
`facets` fragment — **the brief wins every conflict, and a conflict the brief does
not settle escalates** — and copies the documents into the generated repo as
`docs/discovery/**`. Phase 4 then uses `testids[]` as reserved allocations: an
element discovery inventoried keeps its reserved name; new elements derive fresh
names around the reservations (BR-31). The facet hash and BR-14 are untouched;
discovery provenance lives in the prompt log, never in the brief identity.

## Answers flowing back (`/discovery consolidate`, D9)

When the customer returns answers, re-run in consolidate mode: fill the Answer
cells (append; never rewrite Evidence or Proposed default — they are the record of
what was known before the answer), flip each answered row's Status, recompute
`gapsOpen` / `gapsTotal` and the document `status`, re-run the lint, regenerate the
bridge. Consolidation never re-derives units, elements or testids — the reservations
survive the answers, which is what makes them reservations.

## Escalation

A source situation no D-row covers is handled by the escalation doctrine (BRS
§11.1): record the ambiguity in the document's Problem section, add a gap row for
it with the most conservative default, and never improvise silently. A gap row IS
the escalation artefact here — discovery's whole output is the open question made
reviewable.

## Reference files

- `references/discovery-table.md` — D1–D9, the when→then core.
- `references/document-template.md` — the verbatim document skeleton + the DAPA
  reinterpretation rationale.
- `references/testid-derivation.md` — the exact grammar and algorithm.
- `references/figma-contract.md` — the two Figma calls, the pins, the fallback.
- `template/` — the mini-template copied per run: `.discovery/lint.mjs` (the gate),
  `.discovery/questions.json` (Q1–Q24), `.discovery/discovery.schema.json` (the
  bridge shape), and a self-verifying sample unit the intake deletes.

This skill implements BRS §22 of `references/requirements.md` (repo root) and rules
BR-30 through BR-33. Its decision history lives in the plugin's `docs/adr/` — the
skill itself was decided in ADR 008.
