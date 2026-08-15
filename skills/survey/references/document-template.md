# The area document template

Every area document is generated from this shape verbatim (S4). The frontmatter
and the table headers are pinned — a lint reads them — while the prose in the
summary sentence varies with the area.

---

```markdown
---
area: <area-id>
kind: api-area | entity | screen | job
commit: <the sha the survey pinned>
capabilities: <count>
unknowns: <count>
---

# <area-id> — <human name>

<One sentence stating what this area is, in the system's own vocabulary. No
judgement, no recommendation.>

## Capabilities

Every row cites the line that proves it. `observed` means a line in the tree says
so; `inferred` means a competent reviewer would read it that way from the
surrounding code, and an operator must confirm it before relying on it (S6).

| # | Capability | Evidence | Confidence |
| --- | --- | --- | --- |
| C1 | <what it demonstrably does> | `path/to/file.ext:120` | observed |
| C2 | <what the surrounding code implies> | `path/to/other.ext:44` | inferred |

## Unknowns

What the sources do not establish. These are observations, not questions — the
question surface is the discovery skill's Q1–Q24 taxonomy, and the `Question`
column names which one each unknown maps to (S5).

| # | Topic | Evidence of absence | Question |
| --- | --- | --- | --- |
| U1 | <what is not settled> | <the file that would carry it, or that none does> | Q16 |
| U2 | <what is not settled> | <…> | — |

## Coverage

<What this run did not look at, and why — the S7 skips that apply to this area.
"Nothing was found in X" and "X was not looked at" are different sentences.>
```

---

## Why the confidence column is not optional

A survey's whole value is that a later decision can rest on it without re-reading
the codebase. That only holds if the rows a reader must verify are marked as
such. A table where inference and observation look identical is more dangerous
than no table, because it converts someone's reading into an apparent fact and
then hides which rows were which.

## Why unknowns carry a question id rather than a question

Two catalogues of the same questions drift within a release — one gets a new
entry, the other does not, and the two documents a customer signs then disagree.
The discovery skill owns the taxonomy; a survey points at it. When an unknown
fits no question the taxonomy defines, the cell is `—` and the row still exists:
visible and countable beats tidy.
