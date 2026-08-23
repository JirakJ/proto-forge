# ADR 021: A known defect becomes an issue, and its fix carries the regression test

- Status: accepted
- Date: 2026-08-22
- Prompt-log: docs/specs/2026-08-22-production-output-bar-design.md (stated by the operator: "when we know about an issue, a GitHub issue is created right away, it then gets fixed, and a regression test for it will exist")

## Context

The gate-failure protocol bounds *remediation* — two targeted passes, then a
blocked run — but says nothing about what happens to the *knowledge*. A defect
found in review, reported by an operator, or left standing when remediation is
exhausted lived wherever the session lived: the next session re-diagnosed it
from scratch, and the fix, when it came, was under no obligation to prove the
defect could not return. Conventional-commit history already distinguishes
`fix:` from `feat:` — nothing held `fix:` to a higher evidentiary bar.

## Decision

**Record on discovery (BR-49).** The moment a defect is known, it is written
down where work is tracked: `gh issue create` with the reproduction and the
failing gate or test when the repository has a GitHub remote (in a workspace,
on the workspace repository — the cross-part view); a `proposed` ADR when there
is no tracker. Filing is an outward write, so it stays with the operator's
tooling and consent (BR-20's doctrine) — the pipeline instructs it, never
performs it as a side effect.

**A fix proves itself.** The fix is a `fix:` commit whose staged diff carries
the regression test — a test that fails before the fix and passes after — and
whose body references the issue (`Fixes #N`, closing it on merge). The
mechanical half is enforced in `commit-lint`: a `fix:` subject with a staged
diff touching no test file (`*.test.*`, `*.e2e.*`, `e2e/`, `test/`, `tests/` —
the pattern covers every stack's layout) fails the commit. That the test
actually reproduces the defect, and that the issue exists and is referenced,
is review — the limit is stated in the rule, the BR-12 precedent.

## Consequences

A defect can no longer be fixed quietly: the history shows the issue, the fix
commit names it, and the suite grows the test that pins it closed. A `fix:`
commit for something genuinely untestable (a typo in prose) is rare in a
generated repository — and where it happens, the honest move is `docs:` or
`chore:`, which is what the subject taxonomy is for. The check ships in the
byte-identical `commit-lint.mjs` every app template carries, with two selftest
cases per template.

## Alternatives considered

- **Pipeline-side auto-filing of issues**: an outward write as a generation
  side effect is exactly what BR-20 exists to prevent; instruction + operator
  tooling keeps consent where review lives.
- **Requiring a `Fixes #N` trailer mechanically**: repositories without a
  remote tracker (a fresh prototype pre-push) could not commit fixes at all;
  the test half is enforceable everywhere, the reference half is review.
- **Requiring the test to fail on the pre-fix tree** (mutation-style proof):
  would need running the suite against a reconstructed parent tree inside a
  commit hook — minutes per commit, against BR-45's whole point.
