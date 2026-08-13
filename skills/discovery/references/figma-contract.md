# The Figma contract (what the runtime asks for, and what it pins)

Figma is an **optional** source. When the operator supplies Figma links, the runtime
uses exactly two read-only calls of the Figma MCP surface — nothing else, and never a
write:

## 1. `get_metadata` — the tree

Called once per supplied link. It yields the node tree the run derives units and
elements from (D1, D2): top-level frames become `screen` units, named layers become
elements. From the response the run records, per unit and per element:

- `fileKey` — which file
- `nodeId` — which node
- `fileVersion` — which revision of the file the tree was read from

Those three values go into the document's frontmatter `sources` entry and into
`inventory.json` (BR-32). They are the identity of what was seen: a later run
against a moved-on file records a different `fileVersion`, and the difference is
visible in the diff instead of silently producing different units "from the same
link".

## 2. `get_screenshot` — the pixels

Called once per frame or element group worth showing. The image is written under
`docs/<unit>/images/`, and **after** the write its sha256 is computed from the bytes
on disk and recorded in `docs/<unit>/images.lock` together with `fileKey`, `nodeId`,
`fileVersion` and `capturedAt`:

```json
{
  "images/order-list.png": {
    "fileKey": "…",
    "nodeId": "1:5",
    "fileVersion": "…",
    "sha256": "…64 hex…",
    "capturedAt": "2026-08-13T09:00:00Z"
  }
}
```

`capturedAt` is provenance only — no gate reads the clock. What the lint verifies is
the sha256: the committed image is the image the lock describes, byte for byte. This
is the `.shot.lock` discipline of BR-19 with the artefact swapped: determinism over
Figma bytes is **pinned by record, not by reproduction** — nobody promises Figma
would render the same pixels twice, only that the pixels shown are the pixels
captured.

## The brief-only fallback

No Figma links, or no reachable Figma MCP, is a supported mode, not a failure:

- D1 derives no `screen` units; flows become `feature` units, entities and external
  systems become `api-area` units.
- D2 derives testids from the nouns the brief names.
- Every Image cell is `—` with the stated reason (for example
  `<!-- no-image: this run had no Figma source -->`), which the lint accepts exactly
  like any other reasoned absence.
- `sources` frontmatter pins the brief (`path` + `sha256`) and any Confluence pages
  (`pageId` + `version` + `url`) instead.

The run must never block on Figma, ask for Figma credentials, or treat a missing
design as an error — the gap analysis of a brief-only project is precisely the
product.
