# ADR 005: Client-side routing on a single route table

- Status: accepted
- Date: 2026-08-03
- Prompt-log: .prompts/0001-scaffold.md

## Context

A prototype with more than one flow needs addressable views: deep links, back/forward, and a real page for an unknown URL. Hand-rolled `<a href>` navigation reloads the app and leaves no place to guard routes later.

## Decision

React Router 8 (`BrowserRouter` from `react-router`) mounted in the app shell. Paths come only from `src/app/routes.ts` — the single-source route table the consistency gate already enforces — and a `*` route renders `NotFound`. In-app navigation uses `<Link>`; the skip link stays a plain hash anchor.

## Consequences

Deep links and history work; route guards (auth, T8) have one place to live. Tests drive routes through `window.history.pushState`, so no router mock is needed. The package is `react-router`, not `react-router-dom`: the latter is capped at 7.x, which carries the high-severity GHSA-qwww-vcr4-c8h2 advisory that `sec:scan` hard-stops on; v8 ships the same declarative API under the base package.

## Alternatives considered

Plain anchors (full reload, no guards, no 404 view), a hand-rolled hash router (re-implements a solved problem), a file-based router (extra build machinery for a prototype), staying on `react-router-dom` 7 (unpatched high advisory).
