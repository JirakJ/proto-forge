# ADR 014: A decision drags its documentation, enforced as a tree invariant

- Status: accepted
- Date: 2026-08-17
- Prompt-log: docs/specs/2026-08-17-documentation-follows-reality-design.md (stated by the operator: "when updating an ADR, update the documentation including the images — documentation must always match how the generated application currently works")

## Context

The generated templates already refuse several kinds of stale documentation. BR-19 requires every component and feature to have a page, to show the component, and to show *today's* code — a `.shot.lock` records the hash of the source each screenshot was taken from, so a picture of older code fails rather than flatters. BR-36 re-renders `docs/STATUS.md` from the last green verify instead of accepting typed numbers. The environment table in `DEPLOYMENT.md` is derived from configuration, and `docs/external/**` carries provenance.

One direction is uncovered, and it is the one the operator named: **a page can be a faithful description of code that implements a decision nobody holds any more.** Change an ADR and leave the code alone — every source hash still matches, every screenshot is still current, and the page explains an application built on a decision that has since changed.

`commit-lint` does not close it either. It verifies that a commit flips exactly one ADR to `accepted` and carries the trailers; it never checks that the documentation describing that decision moved with it. BR-06 asks for "the ADR transition + its code + tests + docs" in prose, and no gate reads prose.

## Decision

**The subject's lock records the decisions it implements, and `docs:verify` compares them.** Beside `source`, each `.shot.lock` now carries `adrs: { "008": "<digest>" }`. A subject whose recorded digest differs from the ADR's current one fails, naming the ADR and the page.

**The list is derived from the `@adr` anchors already in the code**, never from a field in the ADR. A hand-written `Docs:` list is a second source of truth: it drifts the moment an anchor moves, and BR-15 exists precisely to stop that. The anchors are already there, already linted by `adr:lint`, and already the answer to "which code implements this decision".

**This is a tree invariant, not a commit rule** — and that is the load-bearing part of the decision.

The obvious mechanism is "a commit touching `docs/adr/NNN` must also touch the pages ADR NNN governs". It cannot work. When only the ADR text changes, the component source has not moved, so `docs:shots` regenerates a **byte-identical** image and the lock does not change. There is nothing to stage. Such a gate would force a cosmetic edit to satisfy it, which teaches people to add a space instead of writing documentation — a gate easier to circumvent than to satisfy is worse than no gate.

Recording the decision in the lock has neither problem: nothing needs to be staged for the tree to be consistent, the check survives commit reordering and rebasing, and it covers an ADR amended long after it reached `accepted`, which a commit rule would never see.

**The digest covers the decision, not the file.** It is taken from the ADR's first `## ` heading down. Frontmatter moves when a status flips `proposed → accepted` and when a prompt-log link is backfilled; both are changes to the *evidence for* a decision, not to the decision. Staling every page in the repository over them would train people to re-lock without reading, which destroys the rule's only real mechanism — that a human looks at the page again.

**Re-locking runs `docs:shots`**, which re-photographs at the same time. "Update the images too" is therefore a property of the mechanism rather than a second rule someone must remember.

**Every documented subject gets a lock, not only the photographed ones.** Features carry no screenshots and are where the 030-099 ADR band actually lands; `Portal` and `ProtoUIProvider` are documented without pictures because one renders nothing of its own and the other is structural. Locking only what is photogenic would leave the rule covering the half of the tree where decisions change least.

## Consequences

Editing a decision now fails the build until someone re-reads the pages that implement it. That is the intended cost: the alternative is documentation that is confidently wrong, which is worse than none because a reader trusts it.

Delivery is staged, per the design. BR-42 binds `web` first. The desktop templates carry their own variants of these three scripts — they were never a shared corpus — so they follow next, and `api-*` after them, where `docs:examples` is the producer and the lock is `.doc.lock`. A further rule then gives `ARCHITECTURE.md`, `SECURITY.md` and `TROUBLESHOOTING.md` the derived-block treatment `STATUS.md` already has, which is what closes the operator's second sentence for prose that no gate reads today; it gets its number when its enforcer exists.

## Alternatives considered

**A `Docs:` field in the ADR frontmatter** — more precise for decisions with no code anchor (the delivery band 200-209, security decisions described only in `SECURITY.md`), at the cost of a hand-maintained list that drifts. Those decisions are covered by the staged derived-block rule instead, which is a better fit: they are documented in prose documents, not on subject pages.

**A `commit-lint` rule** — rejected above; it forces cosmetic edits and misses later amendments.

**Hashing the whole ADR file** — simpler, and it fires on every status flip and prompt-log backfill. The resulting churn would make re-locking reflexive, which defeats the purpose.

**Requiring any `docs/` change when `docs/adr/` changes** — trivially satisfiable by one character in an unrelated file. It would measure compliance, not documentation.
