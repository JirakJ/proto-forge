# ADR 012: A form is the worst instrument, so the skill emits something else

- Status: accepted
- Date: 2026-08-15
- Prompt-log: docs/specs/2026-08-13-v0.6.0-design.md (elicitation instruments, stated by the operator alongside the survey request)

## Context

ADR 011 added `survey`: what an existing system contains, with evidence. ADR 008's `discovery` already turns sources into SPIN/DAPA documents and a fixed Q1–Q24 gap taxonomy. Between them the plugin can say what exists and what is unclear.

Neither answers the question that decides whether anything comes back: **how to ask.** And discovery's own output is shaped like a form — a gap table with an empty Answer column, sent to the customer to fill in.

The operator's argument against that is worth restating because it is the whole basis of this decision. A form assumes the customer (a) knows what they want, (b) can write it down, and (c) will spend the writing on someone they have not bought from yet. None of the three holds, and the failure is silent: the form comes back thin or not at all, and the conclusion drawn is that the customer was unclear rather than that the instrument was wrong.

## Decision

A third skill, `elicit`, chooses and emits the **instrument**, ranked by signal per unit of customer effort (E1): artifact-first draft, async voice, diagnostic-with-value, structured interview, observation, telemetry. For a cold prospect it sequences them **3 → 2 → 1** (E2) — the diagnostic attracts by handing over value, the voice note supplies context, the draft closes by inviting a correction — and reserves the live interview for someone already qualified, because a call as the first step is spent on no-shows.

It does not own questions. Discovery's taxonomy stays the single catalogue (the rule ADR 011 records); `elicit` decides the form the asking takes, which is the part that determines whether an answer arrives at all.

**Three properties are enforced by a lint rather than asserted in prose**, because each is the exact point where an instrument silently turns back into a form:

**A draft is visibly unfinished (E3).** This is the load-bearing rule. Artifact-first works because people cannot specify but are excellent critics — and it fails, badly, when the draft looks finished: the customer nods, corrects nothing, and the agreement is worthless because it was never tested. You then hear your own idea back and mistake it for theirs. So every draft carries at least three marked, provisional gaps, and the lint counts them. Three is a floor, not a target: a draft with two is a proposal wearing a question's clothes.

**A diagnostic returns before it asks (E5).** Its output is a mini-audit with a benchmark — findings that mean something against a stated comparison — not a receipt. A diagnostic ending in "thanks, we will be in touch" is a form with better manners, and it fails the gate. Eight questions is the ceiling; past that, completion falls faster than the extra answers are worth.

**Nothing is mostly questions (E9).** A document whose question lines outnumber its content lines is a form regardless of its filename, and the lint says so.

Two supporting rules: telemetry outranks self-report (E8) — where a `survey` run exists its findings are `observed` where an answer would have been `inferred`, and when the two disagree **both are recorded**, because that disagreement is the most informative row either could produce alone. And an interview is never compressed into a written questionnaire (E7): it is recorded, transcribed and extracted, which is what makes it scale; turning it into a form keeps the cost and throws away the signal.

## Consequences

The plugin can now run the whole arc — what exists (`survey`), what is unclear (`discovery`), how to ask (`elicit`) — without a questionnaire anywhere in it. The cost is that `elicit` produces work: a draft to be usefully wrong requires knowing the domain, and a diagnostic that returns value requires having something to say before the customer has paid. Both are the point; an instrument that costs the sender nothing is a form.

An open tension this ADR does not resolve: discovery's own gap table is still form-shaped. That is defensible where it is used — it is a sign-off artefact for an engaged customer, not a cold-outreach instrument — but the boundary deserves stating, and it is stated here rather than left to be discovered by someone sending a gap table to a stranger.

## Alternatives considered

**Adding the instruments to discovery** — would make one skill responsible for the questions and for the packaging, and the seam between them is exactly where the decision gets made. **Emitting a better form** — better wording does not repair an instrument whose premise is false. **Leaving the choice to the operator each time** — it is a decision with a right answer per stage, and re-deciding it under time pressure reliably produces the questionnaire. **Enforcing the deliberate-incompleteness rule in prose only** — the failure mode is precisely that a finished-looking draft feels better to send, so the rule needs a gate rather than a reminder.
