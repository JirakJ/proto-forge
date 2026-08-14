# ADR 004: A registered problem catalogue is the only error surface, and the API speaks English

- Status: accepted
- Date: 2026-08-13
- Prompt-log: .prompts/0001-scaffold.md

## Context

Error shapes are the API surface consumers program against hardest, and the one nobody specifies. An error invented at a throw site is a contract change nobody reviewed; a hand-maintained error list drifts from the code within days (BR-23).

## Decision

Every client-visible failure maps to an entry in `app.platform.Problems`: a stable kebab-case `code`, an HTTP status and an English title, emitted as RFC 9457 `application/problem+json` with a `type` URI under `/problems/`. `AppProblem` is the only throwable for client-visible failures, and its constructor resolves only registered codes — an unknown code fails at the throw site before the gate does. The kernel's `ProblemHandler` advice is the one place errors become responses: boundary failures (unreadable body, type-mismatched path parameter) map to `validation-failed`, unmatched routes and unsupported methods to `route-not-found`, and anything unregistered is logged server-side and served as `internal` — the response never leaks a message or a stack trace. `error:catalog` closes the catalogue from both sides: an unregistered `new AppProblem(...)` or route `.problems(...)` entry fails, a duplicate code fails, and a catalogue entry no throw site or route references fails as stale (the framework-emitted `internal`, `validation-failed` and `route-not-found` are the only exemptions, as a named constant). Every code is documented in `docs/api/problems.md`.

API responses are English only. The catalogue is the backend's i18n-catalogue equivalent — the single source a frontend translates FROM, keyed by `code`; the service never translates and never invents a string at the throw site.

## Consequences

"What can this endpoint return?" is a lookup, not an archaeology. The error contract is diffable: adding, removing or re-shaping an error is a visible change to one file plus its documentation. The cost is ceremony for genuinely one-off errors — which is the point.

## Alternatives considered

Ktor's default error surface (a bare status line, or StatusPages handlers written per call site) — framework-worded, not catalogue-registered, and unreviewable as a contract; free-form `throw RuntimeException` with a translating plugin (translation in the wrong tier); per-module error enums (the same catalogue, minus the uniqueness guarantee).
