---
name: elicit
description: "Use when requirements have to come OUT of a customer who has not written them down — triggers on /elicit, \"jak se zeptat zákazníka\", \"sběr requirementů\", \"nechci dotazník\", \"co poslat klientovi\", \"discovery call\", \"elicit requirements\", \"customer questions\", \"onboarding questionnaire\". Produces the instrument instead of a form: a deliberately unfinished artifact-first draft the customer corrects rather than approves, an eight-question diagnostic whose output is a mini-audit with a benchmark, a three-minute voice prompt, or a SPIN/JTBD interview guide whose recording is extracted automatically — chosen by audience and stage, and sequenced 3-2-1 for a cold prospect. A form is the worst available instrument because it assumes the customer knows what they want, can write it, and will spend the effort before buying; every mode here gets signal without asking anyone to compose it. Feeds the discovery skill's Q1-Q24 taxonomy and consumes a survey run as objective baseline, so telemetry outranks self-report and a disagreement between them is recorded as the finding."
---

# elicit

Get requirements out of someone who has not written them down — **by not asking
them to**.

**The premise.** A form assumes the customer (a) knows what they want, (b) can
write it down, and (c) will spend writing on someone they have not bought from
yet. None of the three holds. This skill emits the instrument that fits the
situation instead, ranked by signal per unit of customer effort (E1).

**Governing rule (determinism).** Every generative decision traces to a row
E1–E9 of `references/elicitation-table.md`. The same inputs and stage yield the
same instrument, the same section shape and the same gap count; only prose
varies.

## Where it sits

```
survey     →  what the system demonstrably does        (ADR 011, telemetry: E1 #6)
discovery  →  what is unclear, as Q1–Q24 gaps          (ADR 008)
elicit     →  the instrument that gets those answered  ← this skill
```

It **asks the questions discovery already knows** — it does not invent a second
catalogue (the same single-source rule ADR 011 records). What it decides is the
*form the asking takes*, which is the part that determines whether an answer
arrives at all.

## When to use

Someone has to talk to a customer, and the instinct is to send a questionnaire.
Also: onboarding a client, qualifying a lead, preparing a discovery call, or
turning a recorded call into a specification.

Do **not** use it to write marketing copy or a proposal. The moment an artifact
argues, it stops collecting.

## The instruments (E1)

| Mode | Instrument | Use when |
| --- | --- | --- |
| `artifact` | A deliberately unfinished draft — outline, spec, wireframe | You can guess well enough to be usefully wrong |
| `voice` | A three-minute voice/screen recording prompt | Context matters more than precision |
| `diagnostic` | Eight questions returning a mini-audit with a benchmark | Cold prospect; you need attention before access |
| `interview` | SPIN / JTBD guide, recorded and extracted | The lead is qualified and the stakes justify the time |
| `observation` | 45 minutes of "show me how you do this today" | The work is tacit and nobody can describe it |
| `telemetry` | A `survey` run over the real system | A repository or tool data exists — costs the customer nothing |

**For a cold prospect the sequence is 3 → 2 → 1** (E2): the diagnostic attracts
by handing over value, the voice note fills in context, the draft closes by
inviting a correction. The interview waits until someone is qualified, or you
burn the slot on a no-show.

## The rule that makes artifact-first work (E3)

An artifact-first draft has one severe failure mode: **a draft that looks
finished sells your idea and drowns theirs.** The customer nods, corrects
nothing, and the agreement is worthless because it was never tested.

So every draft is **visibly unfinished**: at least three marked gaps, each a
provisional choice the reader is expected to overturn.

```markdown
> **Gap G1 — provisional.** We assume the audience is mixed-seniority developers.
> If that is wrong, the whole second half changes.
```

The lint counts them and fails below three. The gaps are the instrument; the rest
of the document is the bait.

## The pipeline — E0 to E3

### E0 — Intake

Copy this skill's `template/` into the working directory byte-for-byte, then
delete the shipped sample. Record the inputs: the audience, the stage
(`cold` | `qualified` | `engaged`), and any `survey.json` / `discovery.json`
next to it — those supply the evidence every claim will cite.

### E1 — Choose the instrument

Per **E1** and **E2**, from audience and stage. A run emits **one** instrument per
document (E9: a diagnostic with an interview guide stapled to it converts as
neither). Record the choice and the reason in `elicitation.json`.

### E2 — Generate it

From `references/artifact-templates.md` verbatim for the chosen mode. Claims cite
their evidence — a `survey` capability row, a `discovery` gap id, or an explicit
`assumption`. Telemetry outranks self-report (**E8**), and where the two
disagree, both are recorded: the disagreement is the finding.

### E3 — Gate it

`node <dir>/.elicit/lint.mjs <dir>` must exit 0. It holds what prose cannot:
a draft carries its three gaps, a diagnostic carries findings **and** benchmarks
and stays within eight questions, a voice prompt asks exactly one thing, and no
document is mostly questions — because a document that is mostly questions is a
form regardless of what it is called.

## What this skill will not do

- **It will not emit a bare question list.** That is a form (E9).
- **It will not gate value behind an answer.** Every instrument gives before it asks.
- **It will not write a persuasive draft.** A draft that argues collects agreement, which is not information.
- **It will not turn an interview into a questionnaire** (E7) — that keeps the cost and throws away the signal.
- **It will not invent questions.** Discovery owns the taxonomy.
