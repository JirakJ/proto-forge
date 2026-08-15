# The instrument templates

One template per mode (E1). Each is generated verbatim; the prose varies, the
pinned sections and the frontmatter do not — a lint reads them.

---

## `artifact` — the deliberately unfinished draft

```markdown
---
mode: artifact
stage: cold | qualified | engaged
gaps: <count, >= 3>
---

# <What this is — named as the customer would name it>

## What this achieves

<One paragraph. The outcome, in their vocabulary. No pricing, no persuasion.>

## Shape

<The agenda / structure / screens / endpoints — concrete enough to argue with.>

## Deliberately open

> **Gap G1 — provisional.** <A choice we made that may well be wrong, and what
> changes if it is.>

> **Gap G2 — provisional.** <…>

> **Gap G3 — provisional.** <…>

## What this leaves out on purpose

<One paragraph, so the omissions read as decisions rather than oversights.>
```

The gaps are the point. Three is the floor, not the target: a draft with two is a
proposal wearing a question's clothes (E3).

---

## `diagnostic` — eight questions that return a mini-audit

```markdown
---
mode: diagnostic
stage: cold
questions: <count, <= 8>
findings: <count, >= 1>
---

# <Name> — where you stand

## What we looked at

<The inputs. When a survey run exists, say so: telemetry outranks self-report.>

## Findings

| # | Finding | Benchmark | Evidence |
| --- | --- | --- | --- |
| F1 | <what is true of them> | <what typical / good looks like> | `survey:C3` / `discovery:Q16` / `assumption` |

## What we still need

<At most eight questions, each stating why it matters — asked AFTER the value
has already been handed over.>
```

The findings table is the deliverable. A diagnostic whose output is "thanks, we
will be in touch" is a form with better manners, and the lint fails it (E5).

---

## `voice` — the three-minute prompt

```markdown
---
mode: voice
stage: cold | qualified
question: 1
---

# <Name>

**One question, three minutes, no typing.**

> <The single question, phrased so it cannot be answered in a word — usually
> "walk me through the last time this actually bit you".>

<Recording link. Nothing else — two questions in a voice prompt is a form.>
```

---

## `interview` — the guide that is never sent

```markdown
---
mode: interview
stage: qualified
minutes: 20 | 30
---

# <Name> — interview guide (internal)

**Not for sending.** Compressing this into a written questionnaire keeps the cost
and throws away the signal (E7).

## Situation
## Problem
## Implication
## Need-payoff

## Extraction

<Where the recording goes, and which discovery gaps the transcript should close.>
```

---

## `observation` — the shadowing script

```markdown
---
mode: observation
stage: qualified | engaged
minutes: 45
---

# <Name> — shadowing script

**Ask them to do the work, not to describe it.**

## What to watch for
## What not to interrupt
## Extraction
```

---

## `telemetry` — the pointer

```markdown
---
mode: telemetry
stage: engaged
---

# <Name> — objective baseline

Produced by a `survey` run (ADR 011). Every row is `observed` or `inferred`, and
where this disagrees with what the customer told us, both are recorded — the
disagreement is the finding (E8).
```
