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

Enforcement is doubled on purpose. `src/test/java/app/arch/ArchitectureTest.java` selects its ArchUnit edge table FROM the record — data-driven, never hardcoded — so the wrong import fails `./gradlew test`. `arch:verify` re-derives the style from the facets on every run, fails when the record or the ArchUnit suite disagrees, and re-proves the dependency direction with its own standalone import scan carrying the same edge tables — so BR-21 holds without a JVM present. The domain imports nothing but the domain, `java.*` and `jakarta.validation` (the constraints ARE the schema, §12.2) in EVERY profile; a brief demanding a style the table contradicts escalates (T22), never silently overrides.

## Consequences

"Chosen by complexity" cannot rot: the chooser re-executes on every verify. Changing the style means changing the facets — a reviewable claim about the brief, not a taste decision. The cost is that a team wanting hexagonal for a simple service must first say why in the facets.

## Alternatives considered

One fixed style for all briefs (ceremony or mud, depending on which), the style as a facet (makes taste hash-identical with intent, breaking BR-14), enforcing only via ArchUnit (a test edit would un-derive the architecture silently — the gate's standalone scan closes that), Spring Modulith (a runtime dependency for a boundary the gate proves statically; rejected by the register's design table).
