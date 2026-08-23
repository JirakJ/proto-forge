# ADR 017: Provenance is English, operator-authored, model-co-authored

- Status: accepted
- Date: 2026-08-22
- Prompt-log: docs/specs/2026-08-22-production-output-bar-design.md (stated by the operator: "store prompts in English only, with no note that anything was translated; every commit is authored by the person who ran the prompt, with the model that prepared the commit as co-author")

## Context

BR-13 required the prompt log to hold each prompt "verbatim", which made the
log's language whatever language the operator typed — and a provenance trail
that switches language per operator costs every later reader exactly what a
mixed-language codebase does (BR-07's argument). Separately, nothing said who a
commit's git author should be: a run that committed as the model erased the
operator from history, and a run that committed as the operator with no model
trailer hid that a model did the work. Both attributions have to survive
`git log`, because `git log` is where an auditor looks first.

The discovery skill already decided its half of the language question in ADR
008 (plugin namespace): discovery documents are always English, whatever the
brief's language. This record extends the same doctrine to the prompt log.

## Decision

**The prompt log is English (BR-13, amended).** A prompt that arrived in
another language is recorded as its faithful English rendering, written as if
authored in English — no translation annotation, no original-language copy.
Non-English *product strings* the brief demands (a Czech UI label) are quoted
in backticks, which the lint treats as code. `prompt:lint` fails a body token
carrying a non-ASCII letter outside code spans; frontmatter (author names) is
exempt, and punctuation and emoji never trigger. "Verbatim" was provenance of
*wording*; what the register actually needs is provenance of *intent*, legible
to every future reader of the repository, and the redaction rule already
established that the log records a faithful rendering rather than raw bytes.

**The operator authors, the model co-authors (BR-46, new).** Every commit's git
author is the operator who ran the prompt; the model that prepared the commit
is named in a `Co-Authored-By: <name> <email>` trailer. `commit-lint` requires
at least one well-formed co-author trailer, and — inside a git repository —
fails a commit whose git-author identity matches a co-author's: the model may
not author. Which model prepared the commit is provenance the prompt log
carries; a regex cannot verify model identity, and the limit is stated.

## Consequences

Existing template `.prompts/` entries are already English; nothing regenerates.
The English check ships in all three prompt-lint variants (web-family, api,
e2e/workspace), and the commit trailer check in the byte-identical
`commit-lint.mjs` every template carries — fixtures gained the trailer, and
three new selftest cases per template prove the trailer half and the
author-is-not-the-model half. An operator hand-committing without a model still
needs a co-author trailer; that is deliberate — in a generated repository every
commit is model-mediated, and a genuinely hand-made commit naming its human
pair is more honest than an unmarked one.

## Alternatives considered

- **Keep the original text beside the English rendering**: doubles every entry,
  reintroduces the mixed-language log, and the operator explicitly asked for no
  translation markers.
- **Language detection by dictionary**: heavier, less predictable than the
  non-ASCII-letter rule, and the rule's escape (backticks for product strings)
  is also the correct authoring habit.
- **Pinning the co-author to a model allowlist**: model names change faster
  than the register; shape plus author≠co-author is the enforceable core.
