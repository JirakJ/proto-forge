# ADR 004: A registered problem catalogue is the only error surface, and the API speaks English

- Status: accepted
- Date: 2026-08-13
- Prompt-log: .prompts/0001-scaffold.md

## Context

Error shapes are the API surface consumers program against hardest, and the one nobody specifies. An error invented at a throw site is a contract change nobody reviewed; a hand-maintained error list drifts from the code within days (BR-23).

## Decision

Every client-visible failure maps to an entry in `App.Platform.Problems`: a stable kebab-case `code`, an HTTP status and an English title, emitted as RFC 9457 `application/problem+json` with a `type` URI under `/problems/`. `AppProblem` is the only exception a handler may raise for a client-visible failure, and its constructor resolves only registered codes — an unknown code fails at the throw site before the gate does. The kernel's `ProblemHandlerMiddleware` is the one place errors become responses: a malformed or missing JSON body and a path parameter that does not parse both map to `validation-failed`, an unmatched path and an unsupported method both map to `route-not-found`, and anything unregistered is logged server-side and served as `internal` — the response never leaks a message or a stack trace. `error:catalog` closes the catalogue from both sides: an unregistered `new AppProblem(...)` or route `Problems = [...]` entry fails, a duplicate code fails, and a catalogue entry no throw site or route references fails as stale (the framework-emitted `internal`, `validation-failed` and `route-not-found` are the only exemptions, as a named constant). Every code is documented in `docs/api/problems.md`.

API responses are English only. The catalogue is the backend's i18n-catalogue equivalent — the single source a frontend translates FROM, keyed by `code`; the service never translates and never invents a string at the throw site.

## Consequences

"What can this endpoint return?" is a lookup, not an archaeology. The error contract is diffable: adding, removing or re-shaping an error is a visible change to one file plus its documentation. The cost is ceremony for genuinely one-off errors — which is the point.

## Alternatives considered

ASP.NET Core's built-in `ProblemDetails` responses (framework-worded, framework-shaped and not catalogue-registered — unreviewable as a contract; the kernel writes the same media type itself so the bytes match the catalogue exactly), free-form `throw new Exception` with a translating middleware (translation in the wrong tier), per-module error enums (the same catalogue, minus the uniqueness guarantee).
