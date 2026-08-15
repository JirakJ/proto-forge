# The elicitation decision table — E1 to E9

Every generative decision in an elicitation run traces to a row here. The rows
exist because the instrument you choose decides the quality of the answer far
more than the wording of any question does.

**The premise.** A form is the worst available instrument for gathering
requirements. It assumes the customer (a) knows what they want, (b) can write it
down, and (c) will spend writing on someone they have not bought from yet. None
of the three holds. Every row below is a way of getting signal without asking
someone to compose it.

---

## E1 — The instrument ladder

Instruments, ordered by signal quality per unit of customer effort. A run picks
the highest one the situation actually supports, never the most convenient:

| # | Instrument | What it is | Why it beats a form |
| --- | --- | --- | --- |
| 1 | **Artifact-first** | Send a finished-looking draft — an outline, a spec, a wireframe, "here is how I picture it" | People cannot specify, but they are excellent critics. Fastest route to the truth, and it sells while it asks |
| 2 | **Async voice / video** | A three-minute voice note or screen recording instead of a text field | Near-zero barrier, several times the context, and it captures what nobody would have written down |
| 3 | **Diagnostic that returns value** | Eight questions whose output is a mini-audit with a benchmark, not "thanks, we'll be in touch" | A form that gives something back converts; a form used as a gate destroys conversion |
| 4 | **Structured interview** (SPIN / JTBD switch) | 20–30 minutes, live | Still the best signal there is. Scales badly — fix that with recording → transcript → extraction (E7), never by turning it into a questionnaire |
| 5 | **Observation / shadowing** | 45 minutes of "show me how you do this today" | Surfaces exactly what no form will ever contain |
| 6 | **Telemetry** | Repository, CI timings, tool metrics — a `survey` run (ADR 011) | An objective baseline beats self-description, which is systematically biased |

## E2 — The cold sequence

With no existing relationship and a short engagement format, a live call as the
first step burns on no-shows. The sequence is **3 → 2 → 1**:

1. **Diagnostic** (E1 #3) attracts, because it hands over something of value.
2. **Voice note** (E1 #2) adds the context the diagnostic could not ask for.
3. **Artifact** (E1 #1) closes, because it converts a conversation into a
   correction.

The interview (#4) is reserved for someone already qualified by the first three.
Observation (#5) and telemetry (#6) enter once there is access — telemetry first
when a repository exists, because it costs the customer nothing at all.

## E3 — Deliberate incompleteness (the load-bearing rule)

The artifact-first instrument has one failure mode, and it is severe: **a draft
that looks finished sells your idea and drowns theirs.** The customer nods,
nobody corrects anything, and the agreement is worthless because it was never
tested.

So a draft is **deliberately unfinished, visibly**. Every artifact-first document
carries at least **three marked gaps** — a named blank the reader is expected to
fill, phrased as a wrong-on-purpose or clearly-provisional choice:

```markdown
> **Gap G1 — provisional.** We assume the audience is mixed-seniority developers.
> If that is wrong, the whole second half changes.
```

The lint counts them. Fewer than three and the run fails, because a draft with
two gaps is a proposal wearing a question's clothes. The gaps are the instrument;
the rest of the document is the bait.

## E4 — What an artifact-first draft contains

A spine the reader can disagree with quickly: the outcome it claims, the shape
(agenda, structure, screens, endpoints), the gaps of E3, and one paragraph of
what it deliberately leaves out. No pricing, no commitment language, no
persuasion — the moment it argues, it stops collecting and starts selling.

## E5 — A diagnostic returns before it asks

A diagnostic's output is the deliverable, not the receipt. It carries findings
with a **benchmark** — what the answer means against a stated comparison — and
every finding cites where it came from. Eight questions is the ceiling: past
that, completion falls faster than the extra answers are worth.

A diagnostic that ends in "thanks, we will be in touch" is a form with better
manners, and the lint fails it: `findings` must be non-empty and each must carry
its `benchmark`.

## E6 — The voice prompt

One question, asked so it cannot be answered in a word: *"Walk me through the
last time this actually bit you."* Three minutes stated as the budget, a
recording link, and no text field anywhere. Two questions in a voice prompt is
already a form.

## E7 — The interview never becomes a questionnaire

An interview is recorded, transcribed, and **extracted into the specification
automatically** — that is what makes it scale. What must never happen is the
compression of an interview guide into a written questionnaire sent to the
customer: it keeps the cost and throws away the signal, which is the worst of
both.

The extraction target is the same one everything else feeds: discovery's Q1–Q24
gaps and, where a system exists, `survey`'s capability rows.

## E8 — Telemetry outranks self-report

Where objective data exists — a repository, CI history, tool usage — a `survey`
run is preferred over asking, and its findings are `observed` where an answer
would have been `inferred` (ADR 011, S6). When telemetry and self-report
disagree, **both are recorded** and the disagreement is the finding: it is the
most informative row either could have produced alone.

## E9 — What is never emitted

- **A bare question list.** If the artifact is mostly questions, it is a form
  regardless of its filename; the lint fails a document whose question lines
  outnumber its content lines.
- **A gate.** No instrument here blocks the customer from getting the value
  attached to it.
- **A leading draft.** See E3 — the gaps are mandatory and counted.
- **A merged instrument.** One document is one instrument. A diagnostic with an
  interview guide stapled to it converts as neither.
