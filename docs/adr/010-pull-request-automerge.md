# ADR 010: A unit of work is a branch, a pull request, and an automatic merge once it is green

- Status: accepted
- Date: 2026-08-14
- Prompt-log: docs/specs/2026-08-13-v0.6.0-design.md (delivery workflow, stated by the operator during the v0.6.0 template build-out)

## Context

Until now the repository had no stated contribution workflow. Work landed on `main` directly or on ad hoc branches, and whether a change was reviewed before it merged depended on who made it. That is survivable for one author and stops being survivable the moment several agents work the same tree concurrently — which is exactly what the v0.6.0 build-out did, with three template agents and a coordinator editing in parallel.

The operator's rule is short: **every implemented unit — a feature, an RFC, a story, an ADR — starts on its own branch and reaches `main` through a pull request; pull requests merge automatically when there are no conflicts.** This applies to everything proto-forge delivers.

Two things make that rule non-trivial here. GitHub's native auto-merge needs branch protection to have something to wait for, and branch protection needs a paid plan on a private repository — the API answers `403 Upgrade to GitHub Pro`. And "no conflicts" alone is a weaker bar than this repository already holds itself to.

## Decision

**One unit of work, one branch, one pull request.** A branch carries a single coherent change: one feature, one fix, one accepted ADR. The existing commit discipline is unchanged and now nests inside it — one accepted ADR is still one commit (BR-06), and a branch may carry several commits when the unit genuinely has several parts.

**Merging is automatic, and the bar is two conditions, not one.** `.github/workflows/automerge.yml` runs after `verify` completes and merges the pull requests that run belonged to, if:

1. the `verify` run was **green** — this repository's own doctrine is that the gates are the interface (ADR 004), and a robot that merged a red branch would contradict every other decision in the tree;
2. the pull request is **conflict-free** (`mergeable == MERGEABLE`) — the operator's stated rule;
3. it is not a draft, it is not from a fork, and it does not carry the `do-not-merge` label.

The second condition is the operator's; the first is added deliberately and recorded here rather than assumed. `do-not-merge` is the manual escape hatch: one label holds a pull request open however green it is.

**The merge is a merge commit, never a squash.** History here is one accepted ADR per commit; squashing would flatten that record into a single line at the moment it reached `main`, destroying the property `adr:lint` and `commit-lint` exist to maintain.

**The workflow never runs the code it merges.** It checks nothing out — `gh --repo` needs no working copy — so a pull request cannot execute anything by being auto-merged. Fork branches are refused outright: merging one with the workflow's own token is how a contributor merges themselves into `main`.

## Consequences

Concurrent agents stop colliding: each lands a reviewable unit, and `main` moves in whole changes rather than half-finished trees. The cost is one round trip per unit — a branch and a pull request even for a one-line fix — which is the price of every change being visible before it lands.

The gate is honest about what it is: a workflow, not GitHub's native feature. If this repository ever goes public or moves to a paid plan, native auto-merge with required status checks is strictly better (it blocks the merge button for humans too, which a workflow cannot), and this file should be revisited rather than kept out of habit.

The rule as stated covers what proto-forge *delivers*. Whether the generated templates should ship this workflow too is deliberately **not** decided here: their `.github/workflows/` corpus is byte-shared across six templates and pinned by `deploy:sync` (ADR 009), so adding it there is a change to the shared surface and needs its own decision.

## Alternatives considered

**GitHub native auto-merge** — the right mechanism, unavailable on this plan; the workflow exists because of that and says so. **Merging on `pull_request` events instead of after `verify`** — fires before the gates have finished, so it would merge on conflict-freeness alone. **Squash merging** — tidier `main`, at the cost of the one-ADR-one-commit record. **A required review instead of automation** — the operator asked for automatic; review pressure here is supplied by the gates, which are stricter and never tired. **Merging any open PR on the branch by name** — a stale run could merge a commit nobody verified; matching on the head SHA is what makes the green signal and the merged bytes the same thing.
