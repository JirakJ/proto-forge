# ADR 001: Separate part repositories composed by one small workspace repo

- Status: accepted
- Date: 2026-08-13
- Prompt-log: .prompts/0001-scaffold.md

## Context

A brief that yields more than one part — a backend, a frontend, a cross-app e2e layer — needs a composition answer before the first part is generated. One mono-repo couples release cadence, CI cost and history of parts that have different owners and different lifetimes; fully independent repos with no shared record lose the one fact that binds them: they answer the same brief. The v0.6.0 design fixed the middle path (T14): a `<project>/` directory that is its OWN small git repository, containing each part as a SEPARATE git repository inside it.

## Decision

**The workspace repo carries exactly three things: the manifest, the shared brief record, and orchestration.** `workspace.json` is the single source of parts — every id, template, directory and role lives there and nowhere else; scripts and gates read it, never a hardcoded list. The shared brief is recorded in the append-only prompt log (`.prompts/0002-brief.md` on a generated workspace), and its sha256 is the `pairedBrief` identity every part's `facets.json` must repeat — the shipped sample pins the sha256 of the sample brief quoted verbatim in README.md, so the strict gate holds from the first clone.

**Part directories are gitignored, by convention `/<dir>/`.** Each part is a separate git repository cloned or generated INTO the workspace; its history must never leak into this repo's. Regeneration rewrites `workspace.json` and the `.gitignore` block together, and the `ws` gate (`pnpm ws:verify`, BR-34) fails when they fall out of step — the same gate that verifies manifest shape, unique ids and dirs, known roles, `pairedBrief` agreement of every PRESENT part (absent dirs are legal pre-clone state), and that `contract.source` lives inside a part.

**The contract is owned by a part, referenced by the manifest.** `contract.source` names the backend's locked OpenAPI artifact (BR-22); consumers — the web part's generated client, the e2e part's consumer-driven suite — resolve it through the manifest rather than each inventing a path.

**Generation order is manifest order** (T14): backend first, so the contract exists before its consumers, then frontend, then e2e. `ws:bootstrap` walks parts in that order and stays dry-run by default; `ws:up` is tool-gated on docker and never a verify precondition.

## Consequences

Each part keeps its own history, its own verify and its own release cadence, while one manifest keeps the set honest — a part scaffolded against a different brief is caught at `ws:verify` time by the `pairedBrief` disagreement, not at integration time by baffling test failures. The cost is a second clone step (workspace first, then parts) and one more repo to version; `ws:status` and `ws:bootstrap` exist to make that cost visible and scriptable.

## Alternatives considered

**One mono-repo for all parts** — couples cadence and CI, and forces one history onto repos with different owners; rejected by the operator's fixed decision. **Independent repos with no workspace** — nothing records that the parts pair, so brief drift between them is invisible until runtime. **Git submodules** — pins part SHAs into workspace history, recreating the coupling the separate-repo decision removes, with the worst UX of both worlds. **A manifest inside one of the parts** — makes that part special and the composition invisible from the outside; the workspace repo is small precisely so the manifest has a neutral home.
