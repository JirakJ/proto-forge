# ADR 020: Owned component library (@jj/proto-ui), one implementation

- Status: accepted
- Date: 2026-08-12
- Prompt-log: .prompts/0001-scaffold.md

## Context

Features must be built from reusable, owned, versioned primitives (BR-10) with
pre-validated accessibility and design tokens, and without a heavy runtime UI dependency
(NFR-02).

An earlier decision hedged that ownership: a `ProtoUIProvider` selected between the owned
implementation and one backed by Radix primitives, on the reasoning that hard accessibility
work should not be reinvented (BR-11). The hedge had a cost that only became visible once
the layering guarantee was taken seriously. A Radix surface stacks on `z-index`; an owned
surface is promoted into the browser's top layer (ADR 008). Those are not two
implementations of one behaviour — they are two different guarantees, and the claim "the
same API, the same tests pass under both" was false exactly where it mattered most.

## Decision

**One implementation, owned.** `packages/proto-ui/` vendors Button, Field, Select, Checkbox,
Dialog, Menu, Table, Tabs, ToastProvider, Tooltip, Portal and a single-source `tokens.ts`.
The provider switch is retired and `@radix-ui/react-dialog` is dropped: the runtime
dependency list is React and nothing else.

**`ProtoUIProvider` remains, re-scoped.** It is the library's root: it owns the overlay
stack and publishes the design tokens as CSS custom properties on the document element. It
no longer selects an implementation, and its only option is a capabilities override, which
exists so tests can exercise the top-layer path and the fallback deliberately rather than
by whatever the environment happens to implement.

**BR-11's concern is met by composition rather than by a dependency.** The hard parts —
focus containment, dismissal, anchoring, inerting — are not reinvented per component. They
live once in `overlay/`, are covered at 100 % including their branch coverage, and are
verified against a real browser. That is the same argument the hedge was making, satisfied
without a third party in the runtime.

The form trio (Field/Select/Checkbox) keeps one wiring contract: label association by id,
`aria-describedby` to an announced inline error. Every primitive takes `data-testid` as a
required prop, owns no user-visible copy of its own (BR-08), and carries a 100 % coverage
floor. Features import only from the package's public surface — which exports the overlay
*contract* but not the overlay *hooks*, because a feature reaching for `useDismiss` or
`promote` is hand-rolling an overlay.

## Consequences

One place owns look, tokens and accessibility, and a bug in a primitive is caught by its own
tests before it multiplies. Dropping Radix removes a runtime dependency and the second
`Dialog` implementation, so there is one code path to reason about and one to test.

The library now owns its focus and dismissal behaviour outright, which is more code to
maintain than delegating it. That is the deliberate trade: it buys a layering guarantee that
cannot be expressed while two mechanisms coexist, and the behaviour is pinned by tests that
run in both jsdom and Chromium rather than by trust in an upstream release.

Teams that specifically wanted Radix no longer have a switch. Swapping the implementation
back is a fork of the seed plus an ADR, not a configuration flag — which is the honest
representation of how large that change is.

## Alternatives considered

**Keep the switch, add the top layer only to the owned branch.** Preserves the option at the
cost of splitting the test contract: the layering suite would have to be provider-aware, so
the strongest guarantee would hold for one branch and not the other.

**Radix-only.** Weakens the owned-library claim, adds a runtime dependency against NFR-02,
and Radix does not use the top layer, so the guarantee would be unavailable.

**MUI or Chakra.** Heavy runtime dependency, NFR-02 violation, and the performance budget
would have to move to accommodate them.

**Ad-hoc per-feature components.** Duplication, BR-10 violation, and every feature would
re-litigate its own accessibility.
