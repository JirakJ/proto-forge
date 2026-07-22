# ADR 100: Single sanitized-HTML entry point + CSP posture

- Status: accepted
- Date: 2026-07-05
- Prompt-log: .prompts/0001-scaffold.md

## Context

`dangerouslySetInnerHTML` is an XSS foot-gun. Any raw HTML must be sanitized, and the surface must be auditable to exactly one place (BRS §4.1).

## Decision

`src/shared/SafeHtml.tsx` is the only component allowed to render raw HTML; it passes input through DOMPurify. Lint bans `dangerouslySetInnerHTML` and unsanitized sinks everywhere else (`react/no-danger`, `no-unsanitized/*`) — disabled only inside `SafeHtml`. A strict CSP (`default-src 'self'`, no `unsafe-inline` scripts) ships in the dev/preview servers and is documented for prod.

## Consequences

Raw-HTML risk is centralized, sanitized, and greppable. Consumers must route through `SafeHtml`.

## Alternatives considered

Ad-hoc `dangerouslySetInnerHTML` with per-site review (unauditable), banning raw HTML entirely (too restrictive for rich content).
