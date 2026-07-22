# ADR 020: Owned component library (@jj/proto-ui)

- Status: accepted
- Date: 2026-07-05
- Prompt-log: .prompts/0001-scaffold.md

## Context

Features must be built from reusable, owned, versioned primitives (BR-10) with pre-validated a11y and design tokens, and no heavy runtime UI dependency (NFR-02).

## Decision

Vendor `@jj/proto-ui` into `packages/proto-ui/` — Button, Field, Dialog, Menu, Table, Tabs, Toast + a single-source `tokens.ts`. Zero runtime deps except React and optional Radix primitives. Primitives carry a 100% coverage floor and ship accessible (roles, keyboard nav, live regions). Features import only from the package's public surface.

## Consequences

One place owns look, tokens, and a11y; a bug in a primitive is caught by its own tests before it multiplies. Growing the primitive set is deliberate.

## Alternatives considered

MUI/Chakra (heavy runtime dep, NFR-02 violation), ad-hoc per-feature components (duplication, BR-10 violation).
