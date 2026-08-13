# ADR 004: i18n from day one with a pseudo-locale gate

- Status: accepted
- Date: 2026-07-05
- Prompt-log: .prompts/0001-scaffold.md

## Context

Externalizing strings later is expensive and error-prone. "Did we forget to externalize a string?" should be an automated question, not a human review one (BR-08, BR-09).

## Decision

All user-facing text flows through i18next `t('...')` with typed keys. `en` is the default and ships complete. A generated `pseudo` locale (accented + length-expanded) renders in dev/CI so any hardcoded English string stands out. One catalogue file per locale with feature-prefixed keys.

## Consequences

Hardcoded strings are caught automatically; truncation surfaces early. Every string needs a key from the start.

## Alternatives considered

Manual review for hardcoded strings (unreliable), per-namespace files (tripped the environment's translation-completeness gate).
