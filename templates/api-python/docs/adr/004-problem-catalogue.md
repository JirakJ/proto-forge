# ADR 004: A registered problem catalogue is the only error surface, and the API speaks English

- Status: accepted
- Date: 2026-08-13
- Prompt-log: .prompts/0001-scaffold.md

## Context

Error shapes are the API surface consumers program against hardest, and the one nobody specifies. An error invented at a raise site is a contract change nobody reviewed; a hand-maintained error list drifts from the code within days (BR-23).

## Decision

Every client-visible failure maps to an entry in `src/app/platform/problems.py`: a stable kebab-case `code`, an HTTP status and an English title, emitted as RFC 9457 `application/problem+json` with a `type` URI under `/problems/`. `AppProblem` is the only raisable for client-visible failures, and its constructor rejects unregistered codes at construction time — the process fails before the gate does. `error:catalog` closes the catalogue from both sides: an unregistered `AppProblem(...)` or route `problems=` entry fails, a duplicate code fails, and a catalogue entry no raise site or route references fails as stale (the framework-emitted `internal`, `validation-failed` and `route-not-found` are the only exemptions, as a named constant). Every code is documented in `docs/api/problems.md`.

API responses are English only. The catalogue is the backend's i18n-catalogue equivalent — the single source a frontend translates FROM, keyed by `code`; the service never translates and never invents a string at the raise site.

## Consequences

"What can this endpoint return?" is a lookup, not an archaeology. The error contract is diffable: adding, removing or re-shaping an error is a visible change to one file plus its documentation. The cost is ceremony for genuinely one-off errors — which is the point.

## Alternatives considered

Free-form `raise Exception` with a translating error middleware (unreviewable surface, and translation in the wrong tier), FastAPI's default HTTPException + 422 surface (framework-shaped, not catalogue-shaped — the normalizer strips it from the contract), HTTP problem libraries (a dependency for a 60-line contract), per-module error enums (the same catalogue, minus the uniqueness guarantee).
