---
mode: artifact
stage: cold
gaps: 3
---

# Two half-days on getting real work out of AI assistants

## What this achieves

Your developers stop using the assistant as a faster autocomplete and start using
it where it actually changes the cost of the work — the parts nobody enjoys and
everybody postpones. By the end they have done it on your codebase, not on a
sample repository, and they leave with the prompts and the guardrails that
produced the result.

## Shape

**Half-day one — where it already pays.** The assistant against your own tree:
tests nobody wrote, the migration everybody avoids, the review pass that catches
what humans skim. Each exercise ends with the artifact in the branch.

**Half-day two — where it lies, and how you notice.** The failure modes that cost
real time: confident wrong answers, silent context loss, generated tests that
assert nothing. Building the habits and the gates that catch them before review.

## Deliberately open

> **Gap G1 — provisional.** We assume a mixed-seniority room of roughly ten
> developers. If it is mostly seniors, the first half-day is too slow and should
> be replaced with the failure-mode material; if it is mostly juniors, the second
> half-day needs a longer runway.

> **Gap G2 — provisional.** We assume the work happens on your repository with
> the assistant your team already licenses. If access cannot be arranged in time,
> everything shifts to a prepared codebase and the transfer to real work drops
> noticeably — worth knowing before we agree a date.

> **Gap G3 — provisional.** We assume the outcome you want is throughput on
> existing work, not headcount reduction and not a proof-of-concept for a
> platform decision. Those are different two days; this one would disappoint you.

## What this leaves out on purpose

No tooling comparison and no model selection: those change every quarter and age
badly, while the habits do not. No governance or policy material either — it is a
real need, but it belongs with the people who own the policy, not in a room of
developers who cannot change it.
