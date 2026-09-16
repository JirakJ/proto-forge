# Generation pipeline

This page describes the main `/proto-forge` workflow as a process: what each phase
consumes, what it produces, and which gate closes it. The normative definition is
[`SKILL.md`](../SKILL.md) and [`references/decision-table.md`](../references/decision-table.md);
if this page and those files disagree, the skill wins and this page needs a fix.

## Governing rule

Every generative decision traces to one of two sources:

1. a fixed rule in `SKILL.md` or a row `T1`–`T24` of the decision table;
2. a recorded entry in the generated repository's `.prompts/` log.

The guarantee is structural determinism: two briefs with equal normalized facets
produce the same file tree, ADR set, and component inventory. Prose, copy, and
domain content vary; nothing addressable does.

## Phase overview

| Phase | Name | Produces | Closing gate |
| --- | --- | --- | --- |
| 0 | Brief intake | Target list, `.prompts/0002-brief.md`, `.proto-forge/facets.json` | Facets validate against the schema |
| 1 | Scaffold cleanup | Demo removed, shell regenerated, snapshot rewritten | `pnpm install && pnpm typecheck && pnpm build` |
| 2 | Domain model | One `src/domain/<entity>/` per entity, ADR 010–019 | Fast lane |
| 3 | Component library and adapters | Provider mounted, persistence or API adapter, ADR 022/023 | Fast lane |
| 4 | Feature build | One feature slice and ADR 030–099 per flow; auth in 040–049 | Fast lane per accepted ADR |
| 5 | i18n and accessibility | Every locale translated, pseudo-locale regenerated, axe green | Fast lane plus `i18n:verify` and the axe E2E |
| 6 | Test build | Coverage floors, mutation score, browser suite | Full `pnpm verify` |
| 7 | Security hardening | Baseline controls applied, scans green, ADR 100–199 when a design choice was made | Fast lane plus `sec:scan` and `sec:conformance` |
| 8 | Documentation and sweep | Component and feature pages with screenshots, duplication and consistency sweep | Fast lane plus `docs:verify`, `dup:scan`, `consistency` |
| 9 | Release | SemVer tag, changelog, SBOM, snapshot, `sync:auto` | Full `pnpm verify` |

Phase 0 is the only interpretive phase. From Phase 1 onward every choice resolves
through the decision table or through a recorded escalation.

## Phase 0 in detail

1. **Derive the targets.** No `backend` facet means one repository from `web`, or
   from a `desktop-<shell>` template when the brief asks for a standalone
   application. A `backend` facet means one workspace containing separate Git
   repositories: the API part first, then the web part when a UI is named, then
   the `e2e` part whenever at least two parts exist.
2. **Record the brief verbatim** as `.prompts/0002-brief.md` before any code is
   generated. Entry `0001` is the shipped scaffold record and is never reused.
3. **Ingest discovery when present.** A `discovery.json` next to the brief seeds
   facet normalization. The brief wins every conflict; an unresolved conflict
   escalates. The bridge hash is recorded in `.prompts/0003-discovery.md`, and
   the discovery documents are copied into `docs/discovery/`.
4. **Normalize into facets** using `references/facets.schema.ts`: entities,
   flows, roles, persistence, locales, non-functional flags, and the optional
   backend block. Entity names become PascalCase and field names camelCase. No
   synonyms and no unstated flow verbs are invented.
5. **Write and hash the facets.** The pair of `facetsVersion` and the SHA-256 of
   the normalized document is the brief identity.

## Escalation

When a facet is not covered by a decision-table row, the skill:

1. writes the ambiguity to `.prompts/` as an open question;
2. emits a `proposed` ADR listing the options;
3. picks the most conservative, most standard option and records why.

A gate waiver is never the conservative default. Relaxing a mandatory gate is an
operator decision that needs an ADR, a reason, and an expiry date.

## Backend reading of the phases

The phase numbers hold for every target; the content branches by template kind.
For an `api-<stack>` part:

- Phase 1 also writes `.proto-forge/architecture.json` from the derivation rules
  (hexagonal, modular monolith, or layered).
- Phase 2 builds the domain layer according to the active profile.
- Phase 3 generates and locks `contract/openapi.json`, adds the persistence
  adapter, append-only migrations, and one outbound adapter per external system.
- Phase 4 builds one endpoint or use case per flow with the backend Definition of
  Done: registry-only paths, a deterministic `operationId`, registered problem
  types, a regenerated and re-locked contract, paginated collections, unit plus
  conformance tests, and a captured documentation example.
- Phase 5 runs the error-catalogue and observability pass instead of i18n.
- Phase 9 additionally publishes the contract and cuts the breaking-change
  baseline under `contract/released/`.

The workspace and e2e parts run their own short chains. The e2e suite against the
running pair belongs to the workspace CI, not to any part's static `verify`.

## Per-feature Definition of Done

An ADR in the feature band flips to `accepted` only when all of the following hold:

- every rendered control performs its real action; no dead-end copy, no no-op
  handler, no `href="#"`; a CRUD flow ships create, read, update, and delete
  together, and a scope cut is an ADR rather than UI copy;
- the feature is composed from the owned component library only;
- every interactive and semantic element carries a unique, namespaced
  `data-testid`, interpolated inside loops, and honors discovery reservations;
- every route path comes from the single route table and is deep-linkable;
- every user-visible string is a catalogue key, as JSX text and as a prop, and is
  translated in every declared locale;
- unit and component tests meet the feature-layer coverage floor;
- at least one Playwright test covers the happy path and the primary error path;
- axe reports zero serious or critical issues and the keyboard path is proven;
- inputs are validated with Zod at the boundary;
- `docs/features/<name>/README.md` exists with a current screenshot;
- the ADR is anchored in code with `// @adr NNN - ...` and references its prompt
  entry;
- the feature commit passed `pnpm verify:fast` before the ADR was accepted.

## Gate-failure protocol

1. **Remediable gates** (coverage, lint, i18n keys, testids, docs, budget): up to
   two targeted fix passes, each logged to `.prompts/` first. A pass may add
   tests, translations, testids, or docs, or fix the flagged line. It may never
   lower a threshold, delete an assertion, or add an allowlist entry for a string
   that simply was not translated.
2. **Hard-stop gates** (secrets, high or critical audit findings, contradiction):
   no automatic remediation. The run stops, emits a `proposed` ADR describing the
   finding, and surfaces it to the operator.
3. **Exhaustion** halts the phase. The snapshot records `blocked`, naming the
   failing gate and the last prompt entry. A blocked run is never tagged.
4. A gate guarding a per-ADR commit runs before the commit is finalized.

## Defect protocol

A defect is recorded the moment it becomes known: a GitHub issue when a remote
exists, otherwise a `proposed` ADR. The fix lands as a `fix:` commit that stages
its regression test in the same diff. The generated `commit-lint` gate refuses a
`fix:` commit that touches no test file. Masking a defect behind copy, a disabled
control, a waiver, or a lowered floor is prohibited.

## Commit and authorship contract

- One accepted ADR is one commit containing the ADR transition, code, tests,
  documentation, and the regenerated snapshot.
- The Git author is the operator who ran the prompt. The model that prepared the
  commit is named in a `Co-Authored-By` trailer. A commit whose author is the
  model fails `commit-lint`.
- The message carries exactly one `ADR:` trailer and one resolving `Prompt-Log:`
  trailer.
- The ADR stays `proposed` and nothing is committed while the fast lane is red.

## Prompt log contract

- One Markdown file per prompt under `.prompts/`, zero-padded and monotonic, with
  `id`, `timestamp`, `phase`, `adr`, and `author` frontmatter plus `## Prompt` and
  `## Outcome`.
- Entries are English. A prompt received in another language is recorded as its
  faithful English rendering without a translation note.
- Existing entries are immutable. Corrections are new entries referencing the
  prior id.
- Secret-shaped values and personal data are replaced with `«redacted:<type>»`
  before the entry is written.

## Related pages

- [Usage guide](USAGE.md) for the operator's view of the same workflow.
- [Generated repository](GENERATED_REPOSITORY.md) for the files the pipeline
  creates and maintains.
- [Verification](VERIFICATION.md) for what each lane proves.
