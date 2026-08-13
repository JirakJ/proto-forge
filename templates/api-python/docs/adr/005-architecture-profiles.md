# ADR 005: The architecture profile is derived from complexity, recorded, and re-derived on every run

- Status: accepted
- Date: 2026-08-13
- Prompt-log: .prompts/0001-scaffold.md

## Context

Service architecture is where ceremony accumulates: hexagonal ports for a two-table CRUD service, or a big ball of mud where six external systems needed isolation. Both failures come from the style being a preference. The style must instead be a pure function of the brief's complexity — and a claim that stays true, not a diagram that decays (BR-21).

## Decision

The style is derived from `.proto-forge/facets.json` by the decision table's rules T15-T17, in order:

- **T15**: `X >= 3` external systems, or `messaging = broker` → **hexagonal** (strict ports-and-adapters; inbound and outbound adapters may not import each other).
- **T16**: else `C >= 2` entity-graph components, or `E >= 8` entities → **modular** monolith (one module per connected component).
- **T17**: else → **layered** (transaction-script; hexagonal ceremony is REJECTED here — this row is its complement).

The derivation is recorded at generation time in `.proto-forge/architecture.json` as `{style, inputs}`. **This prototype derives `layered` from E=1, X=0, C=1, messaging=none** — one entity, no external systems. (This paragraph is the generation-time slot: a generated service records its own derivation here.)

Enforcement is doubled on purpose. import-linter carries one contract file per profile (`importlinter/{layered,modular,hexagonal}.toml`); because import-linter reads static TOML, the ACTIVE profile is selected by `arch:verify` FROM the record — data-driven, never hardcoded — and executed through `uv run lint-imports`. The same gate re-derives the style from the facets on every run, fails when the record or the profile set disagrees, and re-proves the dependency direction with its own standalone import scan carrying the same edge tables — so BR-21 survives even a machine without uv (where the native half is tool-gated and CI enforces it). The domain imports nothing but the domain and pydantic in EVERY profile; a brief demanding a style the table contradicts escalates (T22), never silently overrides.

One Python-specific naming note: `in` is a reserved word, so the adapter packages are `adapters/inbound` and `adapters/outbound` — the same two elements the register calls `adapters/in` and `adapters/out`, under the only names Python can import.

## Consequences

"Chosen by complexity" cannot rot: the chooser re-executes on every verify. Changing the style means changing the facets — a reviewable claim about the brief, not a taste decision. The cost is that a team wanting hexagonal for a simple service must first say why in the facets.

## Alternatives considered

One fixed style for all briefs (ceremony or mud, depending on which), the style as a facet (makes taste hash-identical with intent, breaking BR-14), enforcing only via import-linter (a TOML edit would un-derive the architecture silently — the gate's derivation check and standalone scan close that), generating the TOML from the record at verify time (a gate that edits the tree it verifies).
