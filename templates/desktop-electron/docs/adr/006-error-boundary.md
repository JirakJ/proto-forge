# ADR 006: Crash containment at the shell boundary

- Status: accepted
- Date: 2026-08-03
- Prompt-log: .prompts/0001-scaffold.md

## Context

An uncaught render error unmounts the whole React tree: the user gets a blank page with no explanation and no way back. A prototype that is shown to real users must fail visibly and recoverably.

## Decision

An `ErrorBoundary` class component wraps the routed content in `src/app/App.tsx`. On a caught render error it renders an announced fallback (`role="alert"`) with i18n strings and a retry action that resets the boundary. The shell — header, nav, footer, skip link — stays mounted and usable.

## Consequences

A crash in one feature degrades to a recoverable panel instead of a white screen. The boundary catches render errors only; event-handler and async rejections still need local handling in the feature. No error-reporting service is wired — adding one is a later ADR.

## Alternatives considered

No boundary (blank page — the default failure everyone ships), a boundary per feature (more code, same outcome for the shell), a full-page reload on error (loses in-memory state and hides the failure).
