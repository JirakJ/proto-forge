# ADR 010: Note domain model as a serializable data class that owns its constraints

- Status: accepted
- Date: 2026-08-13
- Prompt-log: .prompts/0001-scaffold.md

## Context

The domain type and its runtime validation must never drift (BRS §12.2). Domain logic must be pure and adapter-agnostic: the same declaration shapes the create payload, the response body and the persisted row.

## Decision

`Note` is an immutable Kotlin `data class` — the single source of the shape — and `NoteCreate` carries its own constraints as a plain function on the type that owns them: `violations()` returns one deterministic line per broken rule (`text: must not be blank`, `text: size must be between 0 and 2000`), in a fixed order, so the problem `detail` a client sees is stable enough to assert on and to capture into docs examples byte-for-byte. The dependency budget (ADR 007) buys no validation framework, and that turns out to be the stronger form of §12.2: the rule and the shape cannot drift apart because they are the same declaration, and the messages are this template's own rather than a library's locale-sensitive defaults.

Both types are `@Serializable(with = …)` with **hand-written `KSerializer`s** — the reason is a coverage-and-honesty argument recorded in ADR 003, and the effect here is that the wire schema (`buildClassSerialDescriptor`, element order, the scalar formats) is a declaration you can read. The wire layer lives in one file (`NoteWire.kt`), which is also what keeps the entity files down to their shape. `UuidSerializer` and `InstantSerializer` map `java.util.UUID` and `java.time.Instant` to strings and name themselves so the OpenAPI emitter can derive `format: uuid` / `format: date-time` from the descriptor alone. kotlinx.serialization is a codec and a descriptor model with no I/O, so the domain stays framework-pure (BR-21).

A `NoteRepository` port abstracts storage; the domain depends only on the port, owns no clock and no id generator, and the fixture factory validates every produced value through the same `violations()`. This is the demo slice's domain — a generated service replaces it with the brief's entities under the same rules.

## Consequences

Type, validation and wire shape cannot disagree. The domain is testable in isolation at the 1.00 floor with no framework on the test classpath, and the persistence adapter proves the same shape against real SQL in the native tier. The cost is that `violations()` is code rather than annotations — about ten lines per payload type, and one place to look.

## Alternatives considered

A validation framework (`konform`, `valiktor`, jakarta-validation) — a dependency-budget line for what is currently ten lines of domain code, plus a second vocabulary for the same rules. A hand-written class plus a separate validator (drift risk — the whole point of §12.2). A mutable bean-style entity as the domain type (aliasing and lifecycle noise for a data record). Exposed's DAO entities as the domain type (couples the model to the persistence framework the profile forbids).
