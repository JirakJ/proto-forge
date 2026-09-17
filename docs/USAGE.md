# Usage guide

## The four workflows

### Main generation

Use `/proto-forge` for a new application. The main skill normalizes the brief into
typed facets, derives target templates and backend architecture, then executes ten
gated phases. It is not intended for brownfield modification.

Minimum useful brief:

- named entities and their important fields;
- user-visible flows and actors;
- local, API, or no persistence;
- required UI locales;
- backend language when building a service;
- desktop shell when building a desktop application;
- external systems, messaging, and authentication intent.

When information is absent, the workflow records the ambiguity, creates a proposed
ADR, and uses a conservative standard choice. That default is reviewable, not a
customer decision disguised as fact.

### Discovery

Use `/discovery` when the main uncertainty is what should be built. Inputs may include
a brief, Figma frames, and exported wiki content. The output is one English SPIN/DAPA
document per screen, feature, or API area, plus `discovery.json`.

The bridge contains pinned sources, gaps, conservative defaults, a facet prefill,
and deterministic `data-testid` reservations. The main generation skill can ingest
it without changing the facet-hash definition. Re-run discovery in consolidate mode
to add stakeholder answers without rewriting the original evidence or defaults.

### Survey

Use `/survey` to inventory an existing system before migration, replacement, or
discovery. It derives API, entity, screen, and job areas from a pinned commit. Every
capability and unknown records file-and-line evidence and an observed/inferred
confidence.

Survey does not review code quality, find bugs, or propose changes. It emits
`survey.json`, which discovery can consume as a pinned source.

### Elicitation

Use `/elicit` when stakeholders need a better way to provide evidence. The skill
selects an instrument such as a diagnostic, voice-led walkthrough, evidence board,
or scenario exercise. The generated artifact must visibly remain unfinished until a
human supplies evidence; otherwise it would be a pre-filled requirements form.

Completed elicitation evidence flows into discovery. It does not flow directly into
code generation without the discovery/normalization step.

## Deterministic input model

The canonical facet schema is `references/facets.schema.ts`. Its major fields are:

| Field | Meaning |
| --- | --- |
| `entities[]` | Domain nouns and typed fields. |
| `flows[]` | Named actor, ordered user-visible steps. |
| `roles[]` | Authorization roles. |
| `persistence` | Frontend persistence: `local`, `api`, or `none`. |
| `apiContract` | Contract consumed by an API-backed frontend. |
| `locales[]` | Real requested locales; pseudo-localization is generated separately. |
| `nonFunctional` | Current offline and realtime flags. |
| `backend` | Stack, external systems, persistence, messaging, and auth for a service. |

Entity and field names are normalized without inventing synonyms. The architecture
style is deliberately not a facet; it is derived from facets so two equivalent
briefs cannot silently receive different architecture.

## Output composition rules

- Frontend-only brief: one repository from `web`.
- Desktop-only brief: one repository from `desktop-tauri` or `desktop-electron`.
- Backend-only brief: a workspace plus an API repository; the exact workspace part
  list is regenerated from the brief.
- Backend plus UI: workspace, API first, UI second, E2E repository when at least two
  parts exist.
- Each workspace part is a separate Git repository.

## Phase and commit discipline

The phase order is intake, scaffold, domain, adapters/components, features,
cross-cutting quality, tests, security, documentation, and release. A phase cannot
advance while its closing gate is red.

Every accepted ADR is committed with the implementation, tests, documentation, and
snapshot that prove it. The operator is the Git author; the model is a co-author,
and the trailer is derived by a commit hook from the prompt-log entry the commit
cites. Subagents run on the tier the model registry routes their activity to, and
a frontier-tier session delegates only to cheaper tiers.
Prompt-log entries are English, append-only, written before the work, and redacted.

Per feature, use the fast lane. Use full verification at the end of the test-build
phase, at release, and in CI. Do not weaken a gate to repair a red build. A legitimate
relaxation is an operator decision with an ADR, reason, and expiry.

## Integration behavior

JIRA and Confluence support follows a staged-first model:

1. enable the integration in `.proto-forge/config.json`;
2. run the corresponding sync command to create an outbox payload;
3. review the payload;
4. for a live write, allow the host, disable dry-run deliberately, provide credentials
   through named environment variables, and pass the explicit commit/approval flags.

No generation phase performs an external write as a side effect.

## Unsupported uses

- modifying an existing application in place;
- native mobile applications;
- silently choosing an unnamed backend stack;
- inventing a second persistence engine or off-table architecture;
- treating automated accessibility checks as full conformance;
- claiming release readiness from plugin-level gates alone.

