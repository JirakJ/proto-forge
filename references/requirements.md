# BRS-PROTO-FORGE-001 — requirements register

The normative source for every `BR-xx`, `NFR-xx` and `BRS §x.y` citation in this
repository: in `SKILL.md`, in `references/`, in the template's source comments, gate
scripts and ADRs.

**This document was reconstructed.** The register it replaces lived outside the
repository, and the only pointer to it was a path on one machine — so ~150 citations
resolved to nothing a reader could open. It is rebuilt from the artefacts that
implement it, in this order of evidence: the ADR that states a decision, the gate
script that enforces it, the source comment at the citation site, and `SKILL.md` /
`templates/web/AGENTS.md`, which restate many rules for their own audiences. No rule here
was invented; §19 records every place the evidence was thin and what was done about it.

Section numbers are **not** free to change. Fifteen citations point at `BRS §x.y`
anchors, so this document adopts that outline rather than a tidier one, and
`scripts/citations.mjs` resolves against these headings.

## §1 Scope and conformance

This register binds two things:

- **the skill** — the pipeline in `SKILL.md` and the decision table in
  `references/decision-table.md`. Rules marked `Scope: plugin` apply here.
- **the prototype** — anything generated from `templates/web/`. Everything else applies here.

A **conforming run** is one where `pnpm verify` exits 0 in the generated prototype and
`.proto-forge/snapshot.json` records `conformance: "strict"`. A run may also be
conforming while stamped `conformance: "waived"`, which means a mandatory gate was
relaxed through a live `waivers[]` entry carrying a reason, an existing ADR and an
expiry date (BR-17). Any other state is non-conforming, and a run whose remediation
was exhausted ends `blocked` and is never released.

A **conforming plugin** is one where `pnpm verify` exits 0 at the repository root and
`node scripts/verify-template.mjs --template <id>` exits 0 for every template listed in
`references/templates.json`.

Requirement levels are **MUST** (a gate fails on violation) and **SHOULD** (reviewed,
not gated). There are no unenforced MUSTs: `scripts/citations.mjs` fails when a rule
names no enforcer, and when a gate is named by no rule.

## §2 Definitions

**Prototype** — a web application slice generated from `templates/web/` by the pipeline in
`SKILL.md`. It compiles, passes its own tests, and passes its own gates.

**Seed** — the vendored `@jj/proto-ui` tree under `templates/web/packages/proto-ui/`. It is
byte-pinned (§17.2) and is not edited during generation.

**Facet** — a normalized field of the brief, typed by `references/facets.schema.ts`.
The hash of the facet set is the *brief identity* (BR-14).

**Gate** — a script named in `templates/web/package.json` that exits non-zero on a violation.
A **mandatory gate** is one listed in `MANDATORY_GATES` (`templates/web/scripts/config.mjs`);
relaxing one requires a waiver (BR-17).

**Waiver** — an entry in `.proto-forge/config.json` `waivers[]` with `gate`, `reason`
(≥15 characters), `adr` (an ADR that exists) and `expires` (YYYY-MM-DD). Without a live
waiver a relaxed mandatory gate runs at `error` regardless of configuration.

**Fixture** — real, typed data used only by tests. Allowed: a store that genuinely
persists and queries; a one-time typed seed dataset in `src/infra/**/seed.ts`; a
zod-validated typed API client; data under `**/__fixtures__/` imported only by
`*.test.*` / `*.e2e.*`; the component catalogue, which never enters a production build.

**Mock** — a substitute that reports what the caller wants to hear. Banned: hardcoded
literals that ignore their arguments; inline `return [{ id: 1, … }]` in a component or
hook; `vi.mock` / `jest.mock` of a first-party path; `__fixtures__` imported by
production `src/`; `throw new Error("not implemented")`; lorem, `TODO`, `FIXME`.

**Surface** — a popup that paints over the page: a modal, a menu, a toast, a tooltip.

## §3 Testing

Tests assert **behaviour**, not implementation. Queries go through Testing Library
roles and `data-testid`; a test may not reach into component internals, and may not
mock a first-party module (BR-12).

End-to-end tests are a separate pass/fail gate and are never folded into a coverage
percentage: a percentage that includes browser runs hides which of the two failed.

### §3.1 Coverage: 100 on every glob, and the configuration is part of the contract

Every glob in `templates/web/vite.config.ts` carries a floor of
`statements/branches/functions/lines = 100`, enforced by Vitest's V8 provider. A floor
below 100 is a standing licence for untested branches; a line that genuinely cannot be
reached is a design problem to fix, never a threshold problem to lower.

What keeps 100 honest rather than performative is the pair of gates around it:
`coverage:policy` locks the configuration — every threshold must read 100, and every
exclusion must be on its allow-list **with the stated reason on the line above**, so the
exclude list stays a record instead of becoming a dumping ground — and `test:mutation`
proves the assertions fire rather than merely execute (§3.2, added with the mutation gate).

Lowering a threshold or adding an exclusion is blocked by a hook
(`templates/web/scripts/hooks/guard-write.mjs`) locally and by `coverage:policy` in CI, where
hooks do not run. A genuine change to the exclusion allow-list is a gate edit and an ADR.

A pure-interface module (a repository port) needs no exclusion: it has zero executable
statements and passes 0/0 vacuously. An exclusion for it would record a need that does
not exist.

The third door is the `v8 ignore` comment, and it is guarded the same way: the current
population is **zero**, an ignore must state a reason of substance and name the harness
case covering the branch in a real browser (`[covered-by: <case-id>]`), and the total
count is pinned in the committed snapshot — growing it is a reviewed diff, never a
drive-by statistic.

- **Enforced by:** `test:unit` (per-glob V8 thresholds), `coverage:policy`, `ignores`
- **Proven by:** `gates:selftest` → "hook: lowering a coverage threshold is blocked" (frontend, backend),
  "coverage: floors at 100 and reasoned exclusions pass", "coverage: a lowered threshold
  fails", "coverage: an exclusion outside the allow-list fails", "coverage: an
  allow-listed exclusion without its reason fails", "coverage: a character-class glob
  cannot truncate the exclude scan" (the tamper-guard cannot be blinded by the tamper it
  guards against), "ignores: a clean tree with a matching pin passes", "ignores: a
  well-formed, evidenced ignore with a matching pin passes", "ignores: a bare ignore
  with no reason fails", "ignores: a reasoned ignore naming no browser evidence fails",
  "ignores: evidence that does not exist is not evidence", "ignores: a population that
  grew past its pin fails"

### §3.2 Mutation testing: the assertions must fire, not merely execute

100 % coverage proves every line ran; it does not prove any assertion would notice the
line changing. `test:mutation` (Stryker, `break: 90`) is the mechanical proof: each
mutant edits one expression, and a mutant that survives the whole suite marks a test
that executes code without asserting its effect.

**The mutated scope is the behavioural core** — `packages/proto-ui/src/overlay/**`,
`packages/proto-ui/tokens.ts`, `src/domain/**` — and that is a deliberate narrowing of
the original design, recorded here rather than hidden in a config file. The first full
run over all of `packages/proto-ui/src/**` scored 74 %, and reading the survivors showed
why: the bulk were mutations of **presentational literals** — `padding: "8px"` → `""`,
style objects, hook dependency arrays — which a behaviour-first suite deliberately does
not pin (§3: tests assert behaviour, never implementation). Appearance has a different
oracle: the browser suite's geometry, hit tests, axe and screenshots. Counting
unassertable mutants in the denominator would have made the score a measure of how much
styling a file contains, not of how strong its tests are.

The run also earned its keep immediately: three surviving mutants in the core were real
assertion gaps (an author-set-attribute test using the same bytes the code would write;
a hollow-constructor case missing from capability detection; a capability guard
observable only through jsdom's own `:popover-open` exception), all fixed by
strengthening the tests, lifting `capabilities.ts` and `topLayer.ts` to 100 %.

- **Enforced by:** `test:mutation`
- **Proven by:** the gate's own `break` threshold — see §19.7 for why a
  `gates:selftest` fixture is impractical here
- **Decided in:** ADR 003

## §4 Security

The baseline below is wired into the template and is not optional. Two of its gates —
the secret scan and the high/critical dependency audit — are **hard-stop**: they are
never auto-suppressed, never waived, and a finding halts the run for a human.

### §4.1 Application controls

**MUST**, all of them:

- A strict Content Security Policy. Production serves `script-src 'self'`; the dev
  server relaxes it only because Vite injects an inline react-refresh preamble.
  Configured in `templates/web/vite.config.ts`, documented in `templates/web/docs/SECURITY.md`.
- Security headers: `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`,
  `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`.
- Environment configuration is validated with zod at the boundary
  (`templates/web/src/config/env.ts`). Nothing reads `import.meta.env` directly.
- External data is zod-validated before it enters the domain. An unvalidated response
  is a defect, not a shortcut.
- Raw HTML has exactly one sanctioned entry point, `src/shared/SafeHtml.tsx`.
  `dangerouslySetInnerHTML` anywhere else fails lint (`react/no-danger`).
- No secrets in the tree, including in `.prompts/**`, which is scanned like `src/**`.

### §4.2 Supply chain

**MUST:** the lockfile is committed and CI installs with `--frozen-lockfile` (NFR-08);
`pnpm audit --prod --audit-level=high` is a hard-stop gate; an SBOM (CycloneDX 1.5
JSON) is built from the real dependency tree as a release artefact; and the seed is
byte-pinned (§17.2).

Dev-tooling advisories do not reach users and are triaged separately, visible through
`pnpm audit --dev`. This is a stated scope, not an exemption: a dev advisory that is
exploitable during a build is treated as production.

## §5 Application shell and accessibility structure

**MUST:** the app shell provides landmarks — `header`, `nav`, `main`, `footer` — and a
skip link to main content. Every page is reachable by deep link through a route whose
path comes from the single route table (§12.3), never a literal.

Accessibility is gated, not reviewed: `axe` reports zero serious or critical violations
on every page and every catalogue state, keyboard paths are asserted in the browser,
and every focusable element shows a visible focus indicator. Accessible names
(`aria-label`, live-region messages) are catalogue keys like any other string (BR-08),
so they are translated rather than hard-coded in English.

Target conformance is WCAG 2.2 AA.

## §6 Internationalization

**MUST:** every user-visible string comes from the catalogue, the default locale is
defined exactly once (§12.3), and adding a locale means translating it. The catalogue's
key type is generated to mirror the default locale, so a key that does not exist is a
type error.

The full completeness contract is BR-09.

## §7 Brief interpretation

Brief intake is the only interpretive step in the pipeline. Everything downstream is
determined by the facets it produces (§8).

### §7.1 Facets

`references/facets.schema.ts` is the single source of brief interpretation, mirrored
into a generated prototype as `.proto-forge/facets.schema.ts`. Normalization rules:
entity names to PascalCase, fields to camelCase, **no synonym invention**, and no flow
verb the brief did not state. A facet the decision table does not cover escalates
(§11.1); it is never guessed.

## §8 Structural determinism

The same normalized brief yields the same **structure** — file tree, ADR set, exported
component set, gate list and order, template and seed versions. Prose is not pinned:
titles and comments are model-varied, and pinning them would make every run a diff.

`.proto-forge/snapshot.json` records the structure; `snapshot:diff` compares against
the snapshot committed in the same commit. ADRs are compared as a set of ids and
statuses, not titles, for the same reason.

## §9 Decision records

ADRs live in `docs/adr/NNN-kebab-title.md` using the MADR skeleton in
`references/adr-template.md`. Lifecycle is `proposed → accepted`, or
`→ superseded by ADR-MMM`. An ADR is never deleted; a reversal is a supersede.

One accepted ADR is one commit, containing the status transition, its code, its tests
and its documentation (BR-06). The gates guarding that commit run **before** it is
finalized, so an accepted ADR in history always corresponds to a commit whose gates
passed.

### §9.6 ADR number ranges

Allocated by facet order, not as encountered — this is load-bearing for BR-14.

| Range | For |
| --- | --- |
| 001-009 | Foundational; pre-written and accepted at scaffold |
| 010-019 | Domain model, one per entity |
| 020-029 | Component library, providers, persistence and API adapters |
| 030-039, 050-099 | Features, one per flow, skipping the auth band |
| 040-049 | Auth model and adapter, only when the brief names auth or roles |
| 100-199 | Security design choices, budget changes, gate waivers |
| 200+ | Post-v1, supersedes, cross-cutting |

The template's own ADR set is a **seed document**, not a history — see §19.3.

## §10 Rule register

### BR-02 — Every interactive and semantic element carries a unique testid

**MUST.** Interactive elements, headings, landmarks, list items, table cells, media,
form parts and anything with an explicit `role` carry a `data-testid`. Layout-only
wrappers are exempt. Uniqueness means uniqueness **in the rendered DOM**, so inside a
`.map()` the value is interpolated. Across files, values are namespaced by feature
(`invoices-submit`, not `submit`). Library primitives make `data-testid` a required
prop.

- **Why:** Without stable addressing, tests reach for text content, which changes with
  every locale; and a duplicated testid makes `getByTestId` silently return the first of
  ten rows forever. Neither failure announces itself.
- **Scope:** frontend, desktop
- **Enforced by:** `lint` (`local/require-testid`, `local/unique-testid`), `testid:scan`,
  an assertion after every component test in `src/test/setup.ts`, and a rendered-DOM
  sweep in `test:e2e`
- **Proven by:** `gates:selftest` → "testid: distinct testids pass", "testid: the same
  testid in two features fails", "testid: a non-kebab-case testid fails"
- **Decided in:** ADR 009

### BR-05 — Every ADR anchor resolves, and every accepted ADR is anchored

**MUST.** An `// @adr NNN - <what>` anchor in production code names an ADR that exists
and is `accepted`. Every accepted ADR numbered ≥010 is anchored at least once in
production code. Every accepted ADR back-references a real `.prompts/NNNN-slug.md`
entry. A coverage-waiver marker resolves to an accepted ADR.

- **Why:** An anchor pointing at a proposed or absent decision documents nothing, and an
  accepted decision nobody anchored is a decision the code does not actually implement.
- **Scope:** all
- **Enforced by:** `adr:lint`
- **Proven by:** `gates:selftest` → "adr: an anchored, accepted, prompt-linked ADR
  passes", "adr: an anchor to an ADR that does not exist fails", "adr: an anchor to a
  proposed ADR fails", "adr: an accepted ADR nobody anchored fails", "adr: an accepted
  ADR with no prompt-log back-reference fails", "adr: a prompt-log reference pointing at
  nothing fails", "adr: the same number on two files fails" (never last-write-wins —
  the pre-written 020/100 sit inside bands a generator allocates from)
- **Decided in:** ADR 002 (prototype namespace)

### BR-06 — One accepted ADR is one commit

**MUST.** A commit that accepts an ADR carries a Conventional Commits subject, exactly
one `ADR:` trailer, exactly one status transition to `accepted` in its diff, and a
resolving `Prompt-Log:` trailer.

- **Why:** A decision spread over several commits cannot be reverted as a decision, and
  a commit accepting two decisions makes the gates that guarded it ambiguous. The
  message can promise anything; the staged diff is what the commit actually does, and
  the two must agree.
- **Scope:** frontend, backend, desktop
- **Enforced by:** `commit-lint` via the `commit-msg` hook — both halves: the message
  (subject, exactly one `ADR:` trailer, a resolving `Prompt-Log:`) and the staged diff
  (exactly one `- Status: accepted` transition, in the ADR the trailer names). Outside
  a git repository only the message half can run.
- **Proven by:** `gates:selftest` → "commit: a trailer matching the one staged
  acceptance passes", "commit: a non-conventional subject fails", "commit: staging two
  acceptances under one trailer fails", "commit: a trailer naming a different ADR than
  the diff accepts fails", and "hook: --no-verify is blocked" (the bypass that would
  make this rule optional)
- **Decided in:** ADR 002 (prototype namespace)

### BR-07 — Code is English-only

**MUST.** Identifiers, comments and string literals in code are English. Locale
catalogues are exempt, and `pseudo` is deliberately decorated.

- **Why:** A mixed-language codebase costs every later reader, and a non-English literal
  in code is almost always a string that should have been a catalogue key (BR-08).
- **Scope:** frontend, backend, desktop
- **Enforced by:** `consistency`
- **Proven by:** `gates:selftest` → "consistency: a non-English script in code fails"
- **Decided in:** ADR 004

### BR-08 — No user-facing literal outside the catalogue

**MUST.** Every user-visible string is a `t()` key — as JSX text **and** as a prop or
object property whose name is user-facing (`title`, `label`, `message`, `emptyLabel`,
`errorMessage`, and any `*Label` / `*Text` / `*Message` / `*Title` / `*Heading` /
`*Description` / `*Placeholder` / `*Caption` / `*Hint` / `*Tooltip` / `*Header` /
`*Error` suffix). The rule runs over the owned library as well: `packages/proto-ui/**`
holds no copy of its own and takes every string as a prop. There is no
`eslint-disable` escape hatch, because the fix is always one line.

- **Why:** The strings that used to ship untranslated were never JSX text — they were
  props (`<Dialog title="Delete note">`, `notify("Saved")`, `{ header: "Name" }`) and
  library-internal `aria-label`s, and every gate stayed green.
- **Scope:** frontend, desktop
- **Enforced by:** `lint` (`i18next/no-literal-string`, `local/no-user-facing-literal`),
  `i18n:verify`, and `stub:scan`, which bans an inline `eslint-disable` of any gated
  rule in production code — the comment is a shortcut marker exactly like `TODO`
- **Proven by:** `gates:selftest` → the i18n suite, in particular "i18n: an untranslated
  value copied from English fails" and "i18n: an allowlisted proper noun may stay
  identical"; the escape hatch by "stub: disabling a gated lint rule inline fails" and
  "stub: a disable for an ungated rule is not this gate's business"
- **Decided in:** ADR 004, tightened by ADR 009

### BR-09 — A declared locale is a translated locale

**MUST.** Every locale in `SUPPORTED_LOCALES` exists on disk, is imported by the
runtime, and reaches exact key parity with the default. Every value is non-empty and
not a placeholder marker. Interpolation placeholders match the default's. Plural
families carry the categories the locale's grammar requires, resolved through
`Intl.PluralRules`. **A value byte-identical to the default fails**, unless
`src/i18n/identical-ok.json` records why it cannot differ — and that allowlist is
itself checked for stale entries. Catalogue keys no code uses fail. A computed key
(`` t(`status.${s}`) ``) fails unless its file declares the key set with
`// i18n-dynamic:`.

- **Why:** Adding `cs.json` full of English values, or of empty strings, is what an
  untranslated locale looks like from the outside, and both used to pass. Czech needs
  `few` and `many` where English needs neither, so key parity alone is not completeness.
- **Scope:** frontend, desktop
- **Enforced by:** `i18n:verify`
- **Proven by:** `gates:selftest` → "i18n: a fully translated locale passes", "i18n: an
  untranslated value copied from English fails", "i18n: an empty value fails", "i18n: a
  TODO placeholder fails", "i18n: a missing translation fails", "i18n: a dropped
  interpolation fails", "i18n: a locale nobody imports fails", "i18n: an undeclared
  catalogue on disk fails", "i18n: a computed key fails without a declaration", "i18n: a
  declared computed key passes and is still checked", "i18n: a catalogue entry no code
  uses fails", "i18n: a stale allowlist entry fails", "i18n: Czech plural forms English
  does not need are required"
- **Decided in:** ADR 009

### BR-10 — Features compose owned primitives, never re-implement them

**MUST.** Features are built from the public surface of `@jj/proto-ui`. A raw form
control (`<button>`, `<input>`, `<select>`, `<textarea>`) or a raw element wearing a
primitive role (`dialog`, `alertdialog`, `menu`, `tooltip`, `listbox`, `tablist`, `tab`,
`combobox`) in `src/**` is a violation. The library itself legitimately owns raw
intrinsics. Code clones over 30 tokens fail, except among library primitives.

- **Why:** A primitive re-implemented in a feature carries none of the library's
  accessibility work and none of its tests, and the divergence is invisible until a
  screen reader meets it.
- **Scope:** frontend, backend, desktop
- **Enforced by:** `dup:scan`, which runs jscpd for clones and component-dup-scan for
  re-implemented primitives
- **Proven by:** `gates:selftest` → "dup: a feature composing proto-ui primitives
  passes" (web), "dup: a raw <button> in a feature fails" (web), "dup: a raw element wearing a
  primitive role fails" (web)
- **Decided in:** ADR 020

### BR-11 — Hard accessibility primitives are not re-invented, and not depended on

**SHOULD.** The owned library must not re-implement solved accessibility problems from
scratch, and must not hard-depend on a third-party runtime to solve them either. Where
both pull, the resolution is recorded as a decision rather than left to preference.

- **Why:** Writing a focus trap by hand reproduces known bugs; hard-depending on a
  headless UI library contradicts the owned-library claim and NFR-02.
- **Scope:** frontend, desktop
- **Enforced by:** ADR review; the shared component test suite, which must pass against
  whatever implementation the current decision selects
- **Proven by:** the primitive test suites under `packages/proto-ui/src/**`, which are
  the same suite regardless of implementation
- **Decided in:** ADR 008 and ADR 020 (prototype namespace). ADR 021 — the provider
  selector — was retired in v0.4.0 when the owned top-layer implementation replaced the
  last third-party runtime; see §19.8 for where its decision now lives.

### BR-12 — No mock data and no stubbed dependencies in delivered code

**MUST.** The fixture/mock line is defined in §2. Production code contains no banned
marker (`TODO`, `FIXME`, `XXX`, `HACK`, `not implemented`, `unimplemented`, `lorem
ipsum`), pulls in no `__fixtures__` module, and no source file anywhere mocks a
first-party path (`@/`, `@jj/`, relative).

- **Why:** A prototype whose persistence is faked has not demonstrated the thing a
  prototype exists to demonstrate. And a test that mocks its own module under test
  asserts the mock.
- **Scope:** frontend, backend, desktop, e2e
- **Enforced by:** `stub:scan`; `consistency` (frontend, backend) for the dead-weight
  corollary — a runtime *dependencies* entry nothing in `src/` or `packages/` imports
  fails (devDependencies are wired through configs and CLIs, where "is it used?" has
  no cheap mechanical answer, so they are held by review; the e2e template ships zero
  runtime dependencies by construction)
- **Proven by:** `gates:selftest` → "stub: clean production code passes", "stub: a
  banned marker in production code fails", "stub: 'not implemented' in production code
  fails", "stub: mocking a first-party module fails", "stub: pulling __fixtures__ into
  production code fails" (frontend, backend), "consistency: a runtime dependency nothing imports fails" (frontend, backend),
  "consistency: an imported runtime dependency passes" (frontend, backend)
- **Limit, stated:** grep cannot prove the absence of inline mock data — a large static
  dataset inside a feature could still pass. The mechanically detectable surface is
  gated; the seed-data allowance is confined by convention to `src/infra/**/seed.ts`.
- **Decided in:** ADR 022

### BR-13 — The prompt log is append-only and well-formed

**MUST.** One Markdown file per prompt in `.prompts/`, named `NNNN-slug.md`,
zero-padded and strictly increasing, with frontmatter `id` / `timestamp` / `phase` and a
`## Prompt` section holding the prompt verbatim. Existing entries are immutable; a
correction is a new entry referencing the prior id. The prompt is written **before** the
code it produced is committed. Secret-shaped values and PII are redacted before writing.

- **Why:** Provenance that can be edited after the fact is not provenance (NFR-10).
- **Scope:** all
- **Enforced by:** `prompt:lint` for structure, a git-history diff in CI for
  append-only, and `templates/web/scripts/hooks/guard-write.mjs` locally
- **Proven by:** `gates:selftest` → "prompt: well-formed, strictly increasing entries
  pass", "prompt: an empty log fails", "prompt: a filename that is not NNNN-slug.md
  fails", "prompt: an id that disagrees with the filename fails", "prompt: an entry with
  no ## Prompt section fails", "prompt: ids that do not strictly increase fail", "hook:
  rewriting an existing prompt-log entry is blocked", "hook: adding a NEW prompt-log
  entry is allowed"
- **Decided in:** ADR 002 (prototype namespace)

### BR-14 — Brief identity is the facet hash

**MUST.** Two briefs whose normalized facets are equal are the same brief, and produce
the same structure (§8). Brief identity is the **pair** `(facetsVersion, sha256 of the
normalized facets)` — `facetsVersion` is part of the hashed document, and absent
optional subtrees (a frontend-only brief has no `backend` key) are omitted from the
serialization, never written as null. The plugin claims no identity across schema
versions: determinism — same brief, same output, in a year — is a promise **per plugin
version**, which is already the doctrine (pinned toolchain, pinned seed). ADR numbers
are allocated by facet order rather than by encounter order, so the ADR set is a
function of the facets.

- **Why:** "Deterministic" has to mean something checkable. Structure is checkable; prose
  is not. And two schema versions calling different structures "the same brief" is the
  exact lie this rule exists to prevent — which is why the version is inside the
  identity, not next to it.
- **Scope:** all
- **Enforced by:** `snapshot:diff`
- **Proven by:** `gates:selftest` → "snapshot: a tree matching its committed baseline
  passes", "snapshot: a file added after the baseline fails", "snapshot: a gate removed
  from verify after the baseline fails"
- **Decided in:** §8, ADR 001

### BR-15 — One definition per single-source registry

**MUST.** The registries in §12.3 are defined exactly once. Accepted ADR titles are
unique, so two accepted decisions cannot silently contradict each other without a
supersede link.

- **Why:** A second definition of the default locale, the token set or the route table
  does not announce itself; it produces two behaviours that agree until they do not.
- **Scope:** frontend, backend, desktop
- **Enforced by:** `consistency`
- **Proven by:** `gates:selftest` → "consistency: one definition per single-source
  registry passes", "consistency: design tokens defined twice fails" (web), "consistency: two
  accepted ADRs sharing a title fails"
- **Decided in:** §12.3

### BR-16 — Every popup surface is on top by construction

**MUST.** Every surface (§2) is promoted into the browser's **top layer**, and also renders
through `<Portal>` into the single body-level overlay root so the no-top-layer path has a
host. Order among surfaces is **the order they opened**, never a per-kind constant.

Nine mechanical consequences, all enforced: no numeric `zIndex` outside the token file;
out-of-flow positioning declares its layer; a `position: fixed` surface goes through the
portal; a surface claims a slot rather than keeping its own books; **exactly one**
`document` keydown listener exists in the library; **exactly one** module reads the overlay
layer base; fixed surfaces in the library live under `overlay/`; the scale stays ordered and
**grows no per-kind overlay entry**; platform top-layer calls happen only in the adapter.

- **Why:** A popup that is on top only until someone adds `transform` to a parent is not
  on top. An ancestor `transform` / `filter` / `will-change` / `opacity < 1` creates a
  stacking context no descendant `z-index` escapes; an ancestor `overflow: hidden` crops
  what is left; and a later sibling with any `z-index` wins on source order. Even a
  perfectly ordered scale loses to `z-index: 2147483647` in application code — which the
  top layer does not compete with at all.

  A per-kind scale is not merely incomplete, it is wrong: ranking `popover` above `modal`
  is correct for one modal and inverted for two, because a menu belonging to dialog A then
  paints above a dialog B opened later, and no choice of offsets repairs it.

  A convention held in a comment is exactly what drifts, because nothing fails when it is
  ignored. Rules 4-9 apply that lesson to the composition itself: a primitive that quietly
  grows its own keydown listener reintroduces "Escape closes everything", and without a
  rule nothing would notice.
- **Scope:** frontend, desktop
- **Enforced by:** `layer:scan`
- **Proven by:** `gates:selftest` → "layer: a portalled overlay on a layer token
  passes", "layer: a hardcoded z-index fails", "layer: an out-of-flow element without a
  layer fails", "layer: a fixed surface rendered in place, without a portal, fails",
  "layer: a scale that grows a per-kind overlay entry fails", "layer: a library surface
  without a slot fails (rule 4)", "layer: a second document keydown listener in the
  library fails (rule 5)", "layer: reading the overlay base outside OverlayStack fails
  (rule 6)", "layer: a platform top-layer call outside the adapter fails (rule 9)",
  "layer: prose about showModal in a doc comment is not a call (rule 9)"
- **Verified in a browser by:** `test:e2e`, through real paint order (`elementFromPoint`)
  rather than by reading a style value back — jsdom has no layout and no paint, so a unit
  test can assert a `zIndex` but never that an element is on top
- **Decided in:** ADR 008

### BR-17 — Tightening is free, relaxing is on the record

**MUST.** Configuration may tighten any gate without ceremony. Relaxing a **mandatory**
gate below `error` requires a `waivers[]` entry with a reason of substance, an ADR that
exists, and an expiry date. Without a live waiver the setting is ignored and the gate
runs at `error` anyway. With one, the run is stamped `conformance: "waived"`, the
relaxation prints on every verify, and it expires by itself. A waiver for a gate that is
not actually relaxed also fails, so the file cannot accumulate reassuring fiction.

A waiver is for a recorded product decision — a single-locale pilot — and needs the
operator's agreement. It is never a way to make a red gate green.

- **Why:** Configurability and enforcement pull against each other. One line of JSON
  quietly returning a build to green, while it ships untranslated UI, is the failure this
  asymmetry exists to prevent.
- **Scope:** all
- **Enforced by:** `config:check`, every gate through `gateResult`, and
  `templates/web/scripts/hooks/guard-write.mjs`
- **Proven by:** `gates:selftest` → "config: the strict default passes", "config:
  relaxing a mandatory gate without a waiver fails", "config: a complete waiver passes
  and is reported", "config: a waiver citing an ADR that does not exist fails", "config:
  a waiver with no real justification fails", "config: a waiver for a gate that is not
  relaxed fails as dead paperwork", "hook: switching a gate to warn in the config is
  blocked", "hook: lowering a coverage threshold is blocked" (frontend, backend), "hook: lowering the
  mutation-score floor is blocked" (frontend, backend), "hook: narrowing the mutation scope is blocked" (frontend, backend),
  "hook: raising the duplication threshold is blocked" (frontend, backend), "hook: widening the duplication
  ignore list is blocked" (frontend, backend)
- **Decided in:** ADR 009

### BR-18 — Every external object has a local record with provenance and an owner list

**MUST.** Everything pushed to, or pulled from, an external system (Confluence, JIRA)
exists locally as one MDX record in `docs/external/<source>/<id>.mdx`, versioned with
the code. The frontmatter carries: `source`, `id`, `url` (absolute, on the configured
host), `title`, `remoteVersion` (required for Confluence — it is the drift oracle),
`remoteUpdatedAt` and `syncedAt` (ISO-8601 instants), `direction` (`push` | `pull`),
and **`affectedFiles` — non-empty, every entry a file that exists**. The records are
the ledger; a second store of the same facts is a BR-15 violation.

On a push, `affectedFiles` is derived from the documents the payload was built from. On
a pull it is a human judgement: reused from an existing record for the same object, or
declared with `--affects` — and a pull that declares nothing writes the record and
fails, naming the flag to re-run with. `sync:status` compares every record against the
remote and reports drift **with the affected files listed**, so an upstream change maps
to the local documents it concerns.

- **Why:** An operator looking at an upstream edit has three questions — which object,
  which revision did we last see, and which of our files does this touch. A record that
  cannot answer the third (`affectedFiles: []`) asserts the object concerns nothing
  here, which is worse than no record: the drift report it feeds would name no work.
- **Scope:** frontend, backend, desktop
- **Enforced by:** `external:verify`
- **Proven by:** `gates:selftest` → "external: a complete record passes", "external: a
  record with no url fails", "external: a url on the wrong host fails when the
  integration is configured", "external: a non-ISO remoteUpdatedAt fails", "external:
  an affected file that does not exist fails", "external: an empty affectedFiles fails
  — it asserts the object concerns nothing", "external: a Confluence record without a
  remoteVersion fails"
- **Decided in:** ADR 009, amended by the v0.4.0 spec §9A

### BR-19 — A component is not finished until it is documented and photographed

**MUST.** Every exported component and every feature has a page under `docs/`. The page
describes the API, the testid map, the i18n keys and the accessibility contract, and it
shows a screenshot — or states, in a `<!-- no-screenshot: reason -->` comment, why there
cannot be one. Screenshots are captured from a catalogue entry point that is never part
of a production build, and each folder's `.shot.lock` records the hash of the source the
image was taken from, so **a screenshot of older code fails** rather than flattering.

- **Why:** Building the component, writing its page and capturing its states is one task,
  not three. Where documentation is a follow-up it does not happen, and where a
  screenshot is not tied to the code it depicts it stays green forever while quietly
  becoming fiction — which is worse than no picture, because a reader trusts it.
- **Scope:** frontend, desktop
- **Enforced by:** `docs:verify` for pages and screenshot freshness, and `overlay:matrix`
  for the whole row: every exported component must be classified (surface | visual |
  structural — the default is not "exempt"), exercised by a unit test, present in the
  harness registry with a mount, covered by the generated browser suite, and documented.
  A surface must additionally prove it wins a hit test, and a structural component must
  NOT have a mount — a picture of a provider is a picture of its child.
- **Proven by:** `gates:selftest` → "docs: a page that states why there is no screenshot
  passes", "docs: a component with no page fails", "docs: a stub page fails", "docs: a
  page with neither a screenshot nor a stated reason fails", "docs: a page referencing a
  screenshot that is not on disk fails", "docs: screenshots with nothing recording which
  code they show fail", "docs: a screenshot taken from older code fails", "matrix: a
  complete row passes", "matrix: an exported component with no case fails as
  unclassified", "matrix: a renderable case with no mount fails", "matrix: a component
  no unit test exercises fails", "matrix: a surface with no topmost case fails",
  "matrix: an undocumented component fails", "matrix: a structural component with a
  mount fails", "matrix: a browser suite that stops reading the registry empties every
  cell", "matrix: a case for a component the library does not export fails"
- **Decided in:** ADR 009

### BR-20 — Propagation is consented, staged-first, and never implicit

**MUST.** No pipeline phase contacts an external system as a side effect of generating a
prototype. Integrations stage their payloads in `.proto-forge/outbox/` first; a live
write requires ALL of: the integration enabled, `dryRun: false`, the target host on the
network allowlist, credentials from the environment, and consent. Consent has exactly
two forms — a per-run `--approve` typed by the operator, or `autoPropagate: true`
committed in `.proto-forge/config.json`: standing, reviewed consent under which
`pnpm sync:auto` (run after each accepted-ADR commit and at release) propagates
unattended. `autoPropagate` stands in for `--approve` and for nothing else.

- **Why:** Generating a prototype must never file tickets in a project other people work
  in unless someone decided that. A committed flag is a decision that went through
  review; a typed flag is a decision for one run; a default is neither. And one flag
  must not open two doors — if `autoPropagate` also implied `dryRun: false`, a reviewer
  reading the diff would not see the dry-run door swing open.
- **Scope:** frontend, backend, desktop
- **Enforced by:** `sync:jira` / `sync:confluence` through `assertMayCommit`
  (`templates/web/scripts/outbox.mjs`, ordered cheapest-first with the credential check
  after the approval check), `sync:auto` for the unattended path
- **Proven by:** `gates:selftest` → "integrations: --commit is refused while the network
  guardrail is closed", "integrations: autoPropagate stands in for --approve",
  "integrations: without autoPropagate the same --commit still demands --approve",
  "integrations: autoPropagate does not bypass dry-run", "integrations: autoPropagate
  does not open the network guardrail"
- **Decided in:** ADR 009 (prototype namespace); ADR 005 (plugin namespace) for the
  standing-consent form

### BR-21 — Dependency direction follows the derived profile

**MUST.** Imports obey the active architecture profile (§13): the domain layer imports
no framework and no adapter; adapters depend inward through ports; in the modular
profile no module reaches into another module's internals. The profile in force is the
one derived from the facets — `arch:verify` re-derives the style from `facets.json`,
fails when `.proto-forge/architecture.json` disagrees, and fails when the boundary
tool's active rule set does not match the derived style.

- **Why:** An architecture that lives in a diagram decays in a week. One that lives in
  a dependency-direction gate cannot: the wrong import fails the build, and the
  "chosen by complexity" claim stays true because the chooser is re-executed on every
  run, not remembered.
- **Scope:** backend
- **Enforced by:** `arch:verify` (eslint-plugin-boundaries / ArchUnit / import-linter
  per stack, driven by one gate script)
- **Proven by:** `gates:selftest` → "arch: the derived style matching
  architecture.json passes", "arch: a domain module importing a framework fails",
  "arch: an adapter importing another adapter's internals fails", "arch: a profile
  disagreeing with the derived style fails"
- **Decided in:** ADR 005 (prototype namespace)

### BR-22 — The committed contract is a locked derivation of the code

**MUST.** `contract/openapi.json` is regenerated from the route registry and schemas,
normalized by the shared normalizer, and byte-compared against the committed spec;
`contract/contract.lock` pins its sha256 and contract SemVer (§14). A breaking change
against the last released contract requires a contract major bump plus an ADR. On the
CONSUMER side the same discipline holds one hop later: a frontend with the `api`
facet generates its typed client from the BR-18-recorded copy of the contract, and
`src/api/.client.lock` pins the recorded contract's sha256 the committed client was
generated from — a newer record with a stale client fails.

- **Why:** A hand-edited spec and the code it describes drift within days, and the
  consumer who trusted the spec finds out in production. A locked derivation cannot
  drift: either the code changed and the lock proves it, or nothing changed.
- **Scope:** frontend, backend
- **Enforced by:** `contract:verify` (backend); `contract:breaking` (backend) — a
  dependency-free structural diff against the last released contract: removed
  paths/methods/operations, narrowed responses, new required request fields;
  `contract:client` (frontend) for the consumer half
- **Proven by:** `gates:selftest` → "contract: a committed spec matching the
  regeneration passes" (backend), "contract: code drift from the committed spec
  fails" (backend), "contract: a stale contract.lock fails" (backend), "contract: a
  breaking change without a major bump fails" (backend), "client: no api facet
  passes with a note" (frontend), "client: a client lock matching the recorded
  contract passes" (frontend), "client: a drifted recorded contract fails until the
  client regenerates" (frontend), "client: an api facet with no recorded contract
  fails" (frontend)
- **Decided in:** ADR 008 (prototype namespace)

### BR-23 — Every error is a registered problem type

**MUST.** Every error a route can emit maps to a registered RFC 9457 problem type with
a stable `type` URI and a unique code, documented in the problem catalogue. An
unregistered 4xx/5xx shape, a duplicate code, and a catalogue entry no code can emit
all fail. API responses are English; the catalogue is the backend's i18n-catalogue
equivalent — the single source a frontend translates FROM, never a string invented at
the throw site.

- **Why:** Error shapes are the API surface consumers program against hardest, and the
  one nobody specifies. A registered catalogue makes the error contract diffable and
  makes "what can this endpoint return?" a lookup instead of an archaeology.
- **Scope:** backend
- **Enforced by:** `error:catalog`
- **Proven by:** `gates:selftest` → "errors: a registered problem type passes",
  "errors: an unregistered error shape fails", "errors: a duplicate problem code
  fails", "errors: a stale catalogue entry fails"
- **Decided in:** ADR 004 (prototype namespace)

### BR-24 — Migrations are append-only and agree with the model

**MUST.** The migrations directory is history: an existing migration is never edited
or deleted (a correction is a new migration), and the schema the migrations produce
must agree with the ORM/model layer per §15. A destructive statement (`DROP`,
truncation) requires an ADR marker in the migration.

- **Why:** A rewritten migration is a database whose past changed under it — every
  environment that already ran the old version now disagrees with every environment
  that ran the new one, silently.
- **Scope:** backend
- **Enforced by:** `migration:verify`
- **Proven by:** `gates:selftest` → "migrations: an append-only history passes",
  "migrations: a rewritten migration fails", "migrations: a model the migrations do
  not produce fails"
- **Decided in:** ADR 006 (prototype namespace)

### BR-25 — Every operation has a unique, deterministic operationId

**MUST.** Every route carries an `operationId` derived as `<resource>-<verb>` in
kebab-case — the same grammar as the frontend's testids — unique across the app, with
route paths coming from a single route registry, never literals. The ids are the
backend's addressability surface: contract clients, docs examples and e2e scenarios
all key on them.

- **Why:** The testid lesson (BR-02) applies verbatim: an operation nothing can name
  reliably is an operation nothing can test, document or generate a client for
  without guessing.
- **Scope:** backend
- **Enforced by:** `opid:scan`
- **Proven by:** `gates:selftest` → "opid: unique deterministic operation ids pass",
  "opid: a duplicate operation id fails", "opid: a route path literal outside the
  registry fails"
- **Decided in:** ADR 008 (prototype namespace)

### BR-26 — An endpoint is not finished until its docs carry a current captured example

**MUST.** Every documented operation shows a captured request/response example
produced by running the app against the harness scenario registry, with an
`example.lock` hashing the handler sources — editing a handler invalidates its
examples until `docs:examples` reruns. A missing example needs an explicit
`<!-- no-example: reason -->`. This is BR-19's screenshot discipline with the
artefact swapped: a picture of an API is a captured exchange.

- **Why:** An example written by hand stays green forever while quietly becoming
  fiction — which is worse than no example, because a reader trusts it.
- **Scope:** backend
- **Enforced by:** `docs:verify`, `docs:examples` for capture freshness
- **Proven by:** `gates:selftest` → "docs: an endpoint with a current captured example
  passes", "docs: a handler edit invalidates its example until docs:examples reruns",
  "docs: an endpoint with no example and no stated reason fails"
- **Decided in:** ADR 009 (prototype namespace)

### BR-30 — Every discovery gap names its element, its evidence and its default

**MUST.** Every row of a discovery gap table names an element the document's Elements
table lists, cites a Q-id the questions register defines, carries non-empty Evidence —
what the pinned sources show, or the evidence of absence — and carries a non-empty
Proposed default stating what will be assumed until the Answer cell overrides it.

- **Why:** A gap that names no element is a vague worry nobody can act on; a
  classification citing no evidence is a guess wearing a table row; and an open
  question with no stated default means the builder will pick one silently anyway —
  this rule makes the pick visible and reviewable instead.
- **Scope:** plugin
- **Enforced by:** `discovery:lint`
- **Proven by:** `pnpm selftest` → "discovery: a gap naming an element the document
  does not list fails", "discovery: empty evidence fails", "discovery: an empty
  proposed default fails", "discovery: a gap citing an unknown Q-id fails"
- **Decided in:** ADR 008 (plugin namespace)

### BR-31 — Discovery testids are allocated deterministically and honored downstream

**MUST.** Discovery reserves every element's `data-testid` by the fixed derivation in
the discovery skill's `references/testid-derivation.md` — the grammar
`^[a-z0-9]+(-[a-z0-9]+)*$`, byte-identical to BR-02's — unique across every document
of the run. The bridge's `testids[]` are **reservations**: the main skill's Phase 4
uses them verbatim for the elements discovery inventoried, and derives fresh names
around them for new elements.

- **Why:** The point of allocating testids before code exists is that tests, docs and
  Figma discussions can address elements by name from day one — which only holds if
  the generated code later answers to those names instead of inventing its own.
- **Scope:** plugin
- **Enforced by:** `discovery:lint` (grammar and cross-document uniqueness)
- **Limit, stated:** the lint proves the grammar and uniqueness halves. That a
  reserved name equals the derivation of its Figma layer name, and that Phase 4
  honors the reservation, cannot be gated offline — replaying the derivation needs
  the Figma tree, which verify never has — so both halves are review-verified, in
  the spirit of §19.6.
- **Proven by:** `pnpm selftest` → "discovery: a non-kebab testid fails",
  "discovery: a testid duplicated across documents fails"
- **Decided in:** ADR 008 (plugin namespace)

### BR-32 — Every discovery document pins its sources

**MUST.** A discovery document's frontmatter names every source it was derived from,
with the pin its type requires: figma sources carry `fileKey` + `nodeId` +
`fileVersion`; brief sources carry `path` + a 64-hex `sha256`; confluence sources
carry `pageId` + `version` + `url`. Every referenced image exists on disk and matches
the sha256 its `images.lock` records; an element without an image states why in a
`<!-- no-image: reason -->` of substance.

- **Why:** A gap analysis is an argument from evidence, and evidence that cannot be
  located is not evidence. Figma moves under the analysis — only a recorded
  `fileVersion` and image hash make "what was seen" a fact rather than a memory
  (BR-19's screenshot discipline, with the design file as the subject).
- **Scope:** plugin
- **Enforced by:** `discovery:lint`
- **Proven by:** `pnpm selftest` → "discovery: a figma source with no fileVersion pin
  fails", "discovery: an image the document references but the disk lacks fails",
  "discovery: an image whose bytes disagree with images.lock fails", "discovery: a
  bare — image cell without a stated reason fails"
- **Decided in:** ADR 008 (plugin namespace)

### BR-33 — The bridge is regenerated from the documents and never disagrees with them

**MUST.** `discovery.json` is a one-directional derivation of the discovery documents:
its `discoveryHash` equals the sha256 of `inventory.json` as committed, and its
`units[]`, `testids[]` and `gaps[]` equal what the documents yield — same units and
kinds, same recomputed `gapsOpen`/`gapsTotal`, `status: answered` exactly when every
Answer cell is filled, same reservations, same rows. Editing the bridge by hand, or
editing a document without regenerating the bridge, is a failure.

- **Why:** The bridge is what the main skill ingests; the documents are what the
  customer signs off. If the two can disagree, the customer approved one thing and
  the generator built another — the exact drift BR-22 bans between code and contract,
  here between analysis and ingestion.
- **Scope:** plugin
- **Enforced by:** `discovery:lint`
- **Proven by:** `pnpm selftest` → "discovery: a bridge that disagrees with its
  documents fails", "discovery: frontmatter counts disagreeing with the gap table
  fail", "discovery: status answered with an empty Answer cell fails", "discovery: a
  unit in the inventory with no document fails"
- **Decided in:** ADR 008 (plugin namespace)

### BR-34 — The workspace manifest is the single source of parts

**MUST.** `workspace.json` declares every part of a composed project (§23): part ids
and dirs are unique, roles come from the closed vocabulary, every part dir is
gitignored by the workspace repository, and a PRESENT part must carry a
`facets.json` whose `pairedBrief` equals the manifest's. An absent part dir is the
legitimate pre-clone state; a present, disagreeing one is two projects pretending
to be one.

- **Why:** The workspace is the only place the composition is stated. A part the
  manifest does not know, or a manifest entry no directory backs, is an
  orchestration script guessing — and `ws:bootstrap`/`ws:up` treat manifest order
  as generation order, so the statement has to be right.
- **Scope:** workspace
- **Enforced by:** `ws:verify`
- **Proven by:** `gates:selftest` → "ws: the shipped manifest passes", "ws: a part
  dir the gitignore does not cover fails", "ws: duplicate part ids fail", "ws: a
  present part whose pairedBrief disagrees fails", "ws: a manifest listing a part
  with no template fails"
- **Decided in:** ADR 001 (prototype namespace)

### BR-35 — The pair is proven by the cross-app layer

**MUST.** The e2e part carries two registries — flow cases derived from the flows
facets and consumer-driven contract cases keyed by `operationId` — and both stay
honest statically: ids unique and kebab-case, every contract case must name an
operation the referenced contract defines (when the contract is reachable; its
absence is the tolerated pre-workspace state), every flow case has spec coverage
and every spec a registry case, and the response validator provably rejects shapes
the contract forbids. The against-the-running-pair execution is the workspace CI's
job (§23), tool-gated locally.

- **Why:** Each part's own suite proves the part; nothing else proves the PAIR. A
  frontend green against its mocks and a backend green against its contract can
  still disagree about reality — the cross-app layer is where that disagreement
  surfaces before a customer finds it.
- **Scope:** e2e
- **Enforced by:** `registry:verify`; the playwright suites themselves in the
  workspace CI
- **Proven by:** `gates:selftest` → "e2e: the shipped registries pass", "e2e: a
  contract case naming an unknown operation fails", "e2e: duplicate case ids fail",
  "e2e: a flow case with no spec coverage fails", "e2e: response validation rejects
  a shape the contract forbids"
- **Decided in:** ADR 001 (prototype namespace)

### BR-37 — The desktop shell's security posture is configuration under a gate

**MUST.** A desktop app's shell is the boundary between web code and the machine,
and its posture is stated in configuration the build reads — so it is checked
mechanically, not remembered. **Electron**: `contextIsolation`, `sandbox`,
`nodeIntegration: false`, `webSecurity` and the navigation lock carry their safe
values literally (a dynamically computed value fails — a flag whose value cannot
be read is a flag nobody reviewed), the strict CSP is injected on every response,
the preload exposes exclusively through `contextBridge`, and the packager's
publish feed is off unless a decision turned it on. **Tauri**: the capability
allowlist is minimal and explicit — every permission beyond the core defaults is
a gate edit plus an ADR — the CSP is present, the updater is disabled or its
endpoints and public key are pinned, and the Rust lockfile is committed with the
shell dependency exact-pinned. Both: an unmaintained-crate advisory the toolchain
forces on us lives in a dated ignore ledger under the `.trivyignore` discipline
(a reason and an expiry, or the gate fails), never in silence.

- **Why:** Every one of these is a default that ships *wrong* in an example
  somewhere on the internet, invisible in review, and fatal in effect: a preload
  that leaks `require`, a window that follows any link, an updater pointing at
  a stranger. Configuration that a gate reads is the only kind that stays true
  after the third person edits it.
- **Scope:** desktop
- **Enforced by:** `shell:verify` for the posture and the ledger's discipline;
  `sec:scan` (desktop-tauri) for the auditing half — the shell's Rust graph is
  audited against that same ledger, since `pnpm audit` cannot see `Cargo.lock`
  and a ledger no auditor reads is triage theatre. Every suppression prints with
  its reason and expiry; an advisory on no entry fails.
- **Proven by:** `gates:selftest` → "shell: the shipped shell configuration
  passes", "shell: a missing CSP fails", "shell: an unpinned shell dependency
  fails", "shell: a widened permission fails" (desktop-tauri), "shell: an undated
  rustsec ignore fails" (desktop-tauri), "shell: an expired rustsec ignore fails"
  (desktop-tauri), "shell: a disabled isolation flag fails" (desktop-electron),
  "shell: a dynamic isolation value fails" (desktop-electron), "shell: a bare
  window assignment in the preload fails" (desktop-electron), "shell: an enabled
  publish feed fails" (desktop-electron), "shell: an advisory on no ledger entry
  fails" (desktop-tauri), "shell: a ledger entry accepts the advisory's alias
  too" (desktop-tauri)
- **Decided in:** ADR 203 (prototype namespace)

### BR-27 — An environment exists only by declaration

**MUST.** `environments{}` in the committed config is the single source of which
delivery environments exist (§20). Everything else derives from it or is checked
against it: an enabled remote environment must have its `deploy/chart/values/<env>.yaml`
and an orphan values file for a disabled environment fails just the same; the
DEPLOYMENT.md environments table is regenerated, never hand-curated; `.env.example`
carries exactly the keys the env schema declares.

- **Why:** An environment that exists in a values file but not in config — or the
  reverse — is a deploy target nobody reviews. The tree stays truthful in both
  directions, which is what makes "early phase = dev only" a fact instead of a hope.
- **Scope:** frontend, backend
- **Enforced by:** `env:verify`, `config:check`
- **Proven by:** `gates:selftest` → "env: enabled dev with its values file passes",
  "env: an enabled environment without a values file fails", "env: a values file for
  a disabled environment fails", "env: a docs table that omits an enabled environment
  fails", "env: a schema key the example never documents fails"
- **Decided in:** ADR 200 (prototype namespace)

### BR-28 — Deploying is consented, staged-first, and environment-scoped

**MUST.** A deploy is an outward-facing effect and follows BR-20's model per
environment: every remote deploy action sits on `guardrails.requireApproval` by
default; `environments.<env>.autoDeploy: true` is committed standing consent that
stands in for the per-run `--approve` of operator-script deploys and for nothing
else; CI promotion is consented by the committed workflow plus a protected GitHub
environment wherever config says `approval: required` — and prod may neither run
unapproved nor be the first enabled environment. The compose flavor is the
single-host simple mode and cannot carry a multi-environment chain.

- **Why:** "Deployed to prod because the flags happened to allow it" must be
  impossible by construction. Consent lives where review lives: in the committed
  config and the protected environment, never in a shell flag someone typed once.
- **Scope:** frontend, backend
- **Enforced by:** `config:check` (the declaration half); `assertMayDeploy` in
  `templates/web/scripts/deploy-lib.mjs` — the door-for-door mirror of
  `assertMayCommit` — behind `env:remote`, plus the approval-preflight step in
  `cd.yml` reconciling config against GitHub environment protection per run
- **Proven by:** `gates:selftest` → "config: prod without required approval fails",
  "config: prod cannot be the first enabled environment", "config: compose flavor
  cannot carry a multi-environment chain", "deploy: --commit is refused while the
  network guardrail is closed", "deploy: autoDeploy stands in for --approve",
  "deploy: autoDeploy on dev does not approve sit", "deploy: a context pointing at a
  different server is refused", "deploy: secrets are never applied, even with
  --commit --approve", "deploy: render stages to the outbox without touching a
  cluster"
- **Decided in:** ADR 200 (prototype namespace); ADR 005 (plugin namespace) for the
  standing-consent form

### BR-29 — Secrets travel by name

**MUST.** Committed files carry environment-variable and Secret *names* only, never
values: `auth.*Env` fields must look like env var names, `.env.example` and every
committed compose/values file may not hold a secret-shaped value, and the runtime
secrets contract is the `envFromSecrets` name list in the chart values plus the
documented provisioning commands — never a value in the tree.

- **Why:** A credential in a committed file is an incident with a delay on it, and
  the mechanical shape check catches the paste before the secret scanner has to.
- **Scope:** frontend, backend
- **Enforced by:** `config:check`, `env:verify`, `deploy:verify`, `sec:scan`
- **Proven by:** `gates:selftest` → "config: a credential pasted into auth.tokenEnv
  fails", "env: a secret-shaped value in a committed env file fails", "deploy: a
  secret-shaped build ARG default fails"
- **Decided in:** ADR 202 (prototype namespace)

### BR-36 — The documentation carries the numbers of the last green verify

**MUST.** `docs/STATUS.md` shows, between its markers, the machine facts of the
verify run it shipped with: unit test counts, the four coverage percentages against
their floors, the mutation score against its break, e2e/conformance counts, (for a
service) contract operation and problem-type counts, and the full gate chain. The
facts come from `.proto-forge/quality.json`, which the test gates' own machine
reports produce during verify — never a typed claim, never a wall-clock stamp. The
`status` gate re-renders the block from quality.json byte-wise and re-checks the
config mirrors (thresholds ≡ the configs, chain ≡ package.json, operation counts ≡
the committed contract), so a hand-edited number or a silently narrowed chain
fails. CI renders the same table into the job summary and uploads quality.json.

- **Why:** "How are we doing?" must have an answer that cannot flatter: a number in
  a README written by hand stays green forever. A number that is a derivation of
  the last green verify is the CI/CD view of the project, in the repo, for every
  generated application.
- **Scope:** all
- **Enforced by:** `status:verify`; `quality:report` as the producer the chain runs
  right before it
- **Proven by:** `gates:selftest` → "status: a fresh quality report passes",
  "status: a hand-edited STATUS block fails", "status: a threshold mirror
  disagreeing with the config fails" (frontend, backend), "status: a gate chain mirror disagreeing with
  package.json fails", "status: a missing quality.json fails"
- **Decided in:** ADR 009 (prototype namespace)

### NFR-02 — No heavy runtime UI dependency

**MUST.** The prototype ships no component-framework runtime beyond React. The owned
library has zero runtime dependencies of its own.

- **Why:** A prototype that pulls a full design-system runtime cannot demonstrate its own
  performance budget, and the budget is what makes the claim checkable.
- **Scope:** frontend, desktop
- **Enforced by:** `budget` (300 kB JS / 60 kB CSS / 250 kB per chunk, gzipped)
- **Proven by:** `gates:selftest` → "budget: a small production bundle passes", "budget:
  JS over the gzipped ceiling fails", "budget: no dist fails rather than reporting zero",
  "budget: refuses to measure a build containing the component catalogue"
- **Decided in:** ADR 001, ADR 020

### NFR-04 — Import boundaries follow the layering

**MUST.** Layers import downward only: `ui` from `ui`; `domain` from `domain` and
`config`; `infra` from `infra`, `domain`, `config`, `shared`; `features` from
`features`, `ui`, `domain`, `infra`, `i18n`, `shared`, `config`; `app` from all of the
above. A domain module may not import infrastructure, and the library may not import the
application.

- **Why:** A domain that imports its persistence cannot be tested without it, and the
  dependency direction is the only thing keeping the layers meaningful.
- **Scope:** frontend, backend, desktop, e2e
- **Enforced by:** `lint` (`boundaries/element-types`)
- **Proven by:** `lint` running over the template's own tree, which contains one module
  per layer
- **Decided in:** ADR 001

### NFR-08 — The toolchain is pinned and reproducible

**MUST.** Node and pnpm versions are pinned (`engines`, `packageManager`, `.nvmrc`); the
lockfile is committed; CI installs with `--frozen-lockfile`.

- **Why:** A prototype that builds differently on two machines has not demonstrated it
  builds.
- **Scope:** frontend, backend, desktop
- **Enforced by:** `sec:scan` (audit against the committed lockfile), CI's
  `--frozen-lockfile` install, `template:integrity` at the plugin level
- **Proven by:** `gates:selftest` → "security: the secret scan cannot be skipped in CI"
- **Decided in:** ADR 001

### NFR-09 — Provenance adds no runtime dependency

**MUST.** The prompt log is plain Markdown in the repository. It reviews in an ordinary
diff, versions with the code it produced, and requires no service.

- **Why:** Provenance stored in a system the repository does not contain is provenance
  that disappears when access does.
- **Scope:** all
- **Enforced by:** `prompt:lint`; the absence of any dependency to enforce
- **Proven by:** `gates:selftest` → "prompt: well-formed, strictly increasing entries pass"
- **Decided in:** ADR 002 (prototype namespace)

### NFR-10 — Provenance is tamper-evident

**MUST.** Every prompt that shaped the code is recorded, and the record cannot be
rewritten without leaving evidence: append-only is checked against git history in CI and
blocked locally by a hook.

- **Why:** A log that can be edited after the fact tells you what someone wishes had
  happened.
- **Scope:** all
- **Enforced by:** the CI history diff, `templates/web/scripts/hooks/guard-write.mjs`
- **Proven by:** `gates:selftest` → "hook: rewriting an existing prompt-log entry is
  blocked", "hook: adding a NEW prompt-log entry is allowed"
- **Decided in:** ADR 002 (prototype namespace)

### NFR-11 — Backend toolchains are pinned per stack

**MUST.** Every backend template pins its whole toolchain the way the web template
pins node+pnpm: exact framework versions with a committed lockfile-equivalent —
`pnpm-lock.yaml` (node), a checksum-pinned Gradle wrapper plus committed dependency
locks (java), a committed `uv.lock` plus `.python-version` (python) — and node+pnpm
besides, because the gate corpus is Node everywhere (§18). Installs in CI use the
frozen/locked mode; a resolution the lock does not name is a failure, not an update.

- **Why:** "The same brief generates the same way in a year" (BR-14) is void the day a
  floating dependency resolves differently. Reproducibility is the toolchain's
  property before it is the generator's (NFR-08, extended per stack).
- **Scope:** backend
- **Enforced by:** `snapshot:diff` (the lockfiles are in the pinned tree), the frozen
  install flags in each template's CI workflow
- **Proven by:** `gates:selftest` → "snapshot: a tree matching its committed baseline
  passes", "snapshot: a file added after the baseline fails"
- **Decided in:** ADR 001 (prototype namespace)

### NFR-12 — Structured, redacting logging only

**MUST.** Production code logs through the platform kernel's structured logger only —
no bare `console.*`, `print`, `System.out` — and log calls do not carry fields whose
names match the PII denylist; the redaction configuration ships in `platform/` and is
part of the byte-pinned seed.

- **Why:** Logs are the output most likely to leave the trust boundary (aggregators,
  vendors, tickets). A field named `password` or `email` in a log call is an incident
  with a delay on it, and grep can catch it before the logger does.
- **Scope:** backend
- **Enforced by:** `log:scan`
- **Proven by:** `gates:selftest` → "logs: structured logger calls pass", "logs: a
  bare console/print in production code fails", "logs: a PII field name in a log call
  fails"
- **Decided in:** ADR 009 (prototype namespace)

### NFR-13 — The dependency budget is a ceiling with a name on it

**MUST.** Each backend template carries a ceiling on production dependency count and
installed size — the service analogue of the web bundle budget (ADR 007 (prototype
namespace)). Exceeding it is remediated by removing weight, never by raising the
number; a genuine budget change is an ADR.

- **Why:** Latency budgets are environment-noise; dependency count and size are
  deterministic and measure the same thing supply-chain risk does — surface.
- **Scope:** backend
- **Enforced by:** `deps:budget`
- **Proven by:** `gates:selftest` → "deps: a runtime dependency set under the ceiling
  passes", "deps: a dependency past the ceiling fails without an ADR"
- **Decided in:** ADR 007 (prototype namespace)

### NFR-14 — Mutation thresholds per stack, ratchet-only

**MUST.** The behavioural core of every backend template runs under mutation testing
with a break threshold pinned per stack — Stryker `break: 90` (node), PIT 85 (java),
mutmut 85 (python), the lower JVM/Python floors reflecting weaker operator sets, each
recorded in the template's ADR 003 (prototype namespace) — and thresholds only ever
ratchet up. The floors are frozen by the guard hook exactly like coverage thresholds.

- **Why:** §3.2's argument does not stop at the browser: 100 % coverage that asserts
  nothing is theatre in a service too, and the first web run proved the gate finds
  real assertion gaps immediately.
- **Scope:** backend
- **Enforced by:** `test:mutation` per stack, `templates/web/scripts/hooks/guard-write.mjs`
  pattern copied per template
- **Proven by:** `gates:selftest` → "hook: lowering the mutation-score floor is
  blocked", "hook: narrowing the mutation scope is blocked" (frontend, backend)
- **Decided in:** ADR 003 (prototype namespace)

### NFR-15 — The container runs as no one in particular

**MUST.** One image, valid under an OpenShift restricted SCC and an AKS baseline
alike: non-root with **no hardcoded UID** (OpenShift assigns one), read-only root
filesystem with declared writable mounts, dropped capabilities, seccomp
RuntimeDefault, base images pinned by digest, resource limits and probes on every
rendered Deployment — asserted on the RENDERED output, so a values edit cannot
silently drop the contract.

- **Why:** A container that needs a particular UID or a writable root works on the
  laptop and fails on the cluster with the strictest policy — which is exactly the
  cluster the enterprise target runs.
- **Scope:** frontend, backend
- **Enforced by:** `deploy:verify`
- **Proven by:** `gates:selftest` → "deploy: a hardcoded runAsUser fails", "deploy: a
  deployment without resource limits fails", "deploy: a Route rendered for an aks
  environment fails"
- **Decided in:** ADR 201 (prototype namespace)

### NFR-16 — Verify is offline; the world is a named CI stage

**MUST.** No verify gate opens a socket or requires a cluster (§21): manifest
validation runs against vendored schemas, container linting is static, and external
binaries follow the tool-gated pattern — enforce when present, note locally when
absent, hard-fail in CI. Building, scanning, signing, pushing and deploying images
are delivery-pipeline stages, never gates.

- **Why:** A gate that needs the network gets skipped the first time the network is
  down, and a skipped gate is a disabled one. Offline verify is also what keeps
  `verify-template` — the standalone proof — meaningful on any machine.
- **Scope:** frontend, backend
- **Enforced by:** `deploy:verify` (vendored `deploy/schemas/`, no sockets)
- **Proven by:** `gates:selftest` → "deploy: the gate passes with no network and no
  cluster configured"
- **Decided in:** ADR 200 (prototype namespace)

### NFR-17 — Provenance reaches the cluster

**MUST.** Base images are pinned by digest and the built image's identity is carried
to the running workload: the build stamps the git SHA into the served
`version.json`, the smoke test asserts the running SHA after every deploy, and —
once the delivery pipeline lands — images are keyless-signed with the repository's
workflow identity and verified before rollout, with the image SBOM attested.

- **Why:** "What exactly is running in prod?" must have a mechanical answer. A digest
  chain from Dockerfile to the serving pod is that answer; a tag chain is not.
- **Scope:** frontend, backend
- **Enforced by:** `deploy:verify` (digest pins); `deploy/smoke.mjs` post-deploy; the
  delivery pipeline's own steps — `package.yml` "cosign sign + attest the SBOM" and
  `cd.yml` "cosign verify the workflow identity" before every rollout, with deploys
  keyed by digest, never by tag (a CI-mechanism proof, the NFR-10 precedent)
- **Proven by:** `gates:selftest` → "deploy: a Dockerfile with a floating base tag
  fails", "deploy: render stages to the outbox without touching a cluster"
- **Decided in:** ADR 202 (prototype namespace)

### NFR-18 — Development failures fail with a name and a fix

**MUST.** The known failure classes of developing and testing a generated
application are handled before they cost an afternoon: `doctor` diagnoses the
environment (toolchain pins vs what is installed, hooks installed after a clone,
the installed tree agreeing with the lockfile, stale mutation caches, occupied
ports, missing browsers, the env file) and every finding names its one-command
fix; the test configuration pins the nondeterminism sources (TZ=UTC at config
level, asserted by the test setup); and `docs/TROUBLESHOOTING.md` is the curated
symptom → cause → fix catalogue of the classes that remain — including the ones
this plugin's own construction hit. Tool-gated gates keep printing what was
skipped and why, so an absent binary reads as a note, never as silence.

- **Why:** "It does not work on my machine" is a catalogue of maybe a dozen causes
  per stack, and every one of them is cheaper to detect than to debug. A failure
  that names itself and its fix is a five-minute event; the same failure bare is
  an afternoon.
- **Scope:** all
- **Enforced by:** `doctor` (the actionable diagnosis); the TZ pin asserted by the
  test setup; the tool-gated skip-with-note discipline (prose, §21)
- **Proven by:** `gates:selftest` → "doctor: a clean tree passes", "doctor: a stale
  mutation cache is named with its fix" (frontend, backend), "doctor: a missing env
  file is named with its fix" (frontend, backend)
- **Decided in:** ADR 009 (prototype namespace)

### NFR-19 — Self-healing is tiered, bounded, and on the record

**MUST.** `heal` repairs a red verify in three tiers and never any other way.
Tier 1, on by default: MECHANICAL regeneration from a data-driven healing registry
— stale screenshots, examples, status blocks, a stale client or contract, a stale
mutation cache — never a snapshot, a seed, or anything semantic; a consent act is
not a heal. Tier 2, OFF by default: a bounded agent loop that only exists once
`selfHealing.agent.enabled: true` is committed — reviewed standing consent, the
autoPropagate form — and that hard-stop gates (secrets, audit) never enter; the
quality floors stay frozen by the guard hooks no matter who is editing. Every pass
of every tier writes its prompt-log entry BEFORE acting, and passes stop at the
configured bound (1–5; an unbounded loop is a config error). Tier 3 is escalation,
not persistence. In CI the optional heal workflow runs tier 1 only and opens a PR
with the result; enabling it is a repository variable plus the committed flag.

- **Why:** A loop that can edit until green will eventually make the wrong thing
  green. Bounds, consent, the hard-stop exclusion and write-ahead logging are what
  separate self-healing from self-deception — the gate-failure protocol, executed
  by a tool instead of hoped for.
- **Scope:** all
- **Enforced by:** `config:check` (the consent form and the pass bounds); the guard
  hooks freezing every quality floor regardless of the editor (prose)
- **Proven by:** `gates:selftest` → "heal: a mechanical drift heals in one pass",
  "heal: a hard-stop gate is never healed", "heal: the agent tier without committed
  consent is refused", "heal: every pass writes a prompt-log entry first", "heal:
  passes stop at the configured bound", "config: an unbounded healing loop fails"
- **Decided in:** ADR 009 (prototype namespace)

### NFR-20 — One responsibility per module (SRP)

**MUST.** A module does one job, and a module that grows a second is split rather than
sectioned with comments. Concretely, in the part of the tree where this bites: an overlay
primitive **composes** the `overlay/` hooks and implements none of their concerns itself —
no primitive owns its own dismissal, focus containment, scroll lock, inert bookkeeping or
platform call.

- **Why:** `Dialog` previously did portalling, focus trapping, Escape handling and
  layering in one file, and each of those was untestable without the other three. The
  reason the two-modal and menu-in-modal defects went unnoticed for so long is that no
  test could address the pieces separately.
- **Scope:** frontend, backend, desktop, e2e
- **Enforced by:** `lint` (the SRP ceilings: max-lines 200, max-lines-per-function 60,
  complexity 8, max-depth 3, max-params 3 — every template), and `layer:scan` (web) for
  the overlay composition: one dismiss owner, one reader of the fallback scale, one
  adapter for platform calls
- **Proven by:** `gates:selftest` → "layer: a library surface without a slot fails (rule 4)" (web),
  "layer: a second document keydown listener in the library fails (rule 5)" (web), "layer: reading
  the overlay base outside OverlayStack fails (rule 6)" (web), "layer: a platform top-layer call
  outside the adapter fails (rule 9)" (web)
- **Decided in:** ADR 008

### NFR-21 — Open for a new kind of surface, closed for edits to the old ones (OCP)

**MUST.** Adding a kind of overlay is a new composition of the existing hooks, not an
edit to the primitives that already exist. A new kind arrives with its own tests, harness
case and documentation, and it does not change the behaviour of any other kind.

- **Why:** A per-kind stacking scale is the anti-pattern this replaces: adding a fifth
  surface meant re-deciding where the other four paint, and every such decision was a
  chance to invert two of them.
- **Scope:** frontend, desktop
- **Enforced by:** `dup:scan`, `docs:verify`
- **Proven by:** `gates:selftest` → "dup: a feature composing proto-ui primitives passes" (web),
  "docs: a component with no page fails"
- **Decided in:** ADR 008, ADR 020

### NFR-22 — Depend on contracts, not on concretions (DIP)

**MUST.** A primitive depends on the overlay stack through **context**, never on a module
singleton, so a test can mount an independent stack and a tree can pin its own
capabilities. Domain code depends on a repository **port**, never on an adapter. Feature
code depends on the library's public surface, never on a file inside it.

- **Why:** A module singleton is a global with a nicer name: two trees in one document
  would fight over it, and no test could isolate either. The same argument applies one
  layer down, which is why persistence sits behind a port.
- **Scope:** frontend, desktop
- **Enforced by:** `lint` (`boundaries/element-types`), `typecheck`, `consistency`
- **Proven by:** `lint` and `typecheck` running over the template's own tree, which
  contains one module per layer, plus the overlay suite's *keeps two provider trees
  independent* and *uses the capabilities it is given rather than detecting them*
- **Decided in:** ADR 001, ADR 008, ADR 022

### NFR-23 — Narrow interfaces (ISP)

**MUST.** A consumer is not made to depend on what it does not use. A hook takes the
members it reads, not an object that happens to contain them; a non-blocking surface does
not import scroll-lock or inert machinery; a feature imports the primitives it renders,
not the library's internals.

- **Why:** `detectCapabilities(view: Window)` was rejected by the type checker and rightly
  so — it promised hundreds of members to read three. The narrow type is not only more
  honest, it is what lets a test pass an object literal instead of casting away the type
  system, and a cast is where a test starts asserting its own fiction.
- **Scope:** frontend, desktop
- **Enforced by:** `typecheck`, `lint`
- **Proven by:** `typecheck` over the template's own tree, plus the overlay suite's
  *survives a view missing each constructor entirely*
- **Decided in:** ADR 008

### NFR-24 — One contract, interchangeable surfaces (LSP)

**MUST.** Every overlay satisfies one `OverlaySurface` contract — kind, open, dismissal,
testid — so a caller that can drive one can drive any of them. This is what makes a single
generated browser suite able to exercise every surface rather than one hand-written spec
per component.

- **Why:** Where two implementations of "the same" component differed on the property that
  mattered most — one portalled and one did not — the claim "the same tests pass under
  both" was false exactly where it was load-bearing.
- **Scope:** frontend, desktop
- **Enforced by:** `typecheck`, `dup:scan`
- **Proven by:** the primitive suites under `packages/proto-ui/src/**`, which drive each
  surface through the same contract
- **Decided in:** ADR 008, ADR 020

### NFR-25 — Every gate has a demonstrated failure case

**MUST.** For every gate, `gates:selftest` builds a throwaway project, breaks exactly one
thing, and asserts the gate's exit code and the wording of its complaint. A gate with no
such case is not considered enforcing. Where a gate cannot be exercised in a fixture — it
needs a network, a registry, an external binary — the limit is stated in §19 rather than
covered by a case that only proves the binary is absent.

- **Why:** A gate nobody has seen fail is a gate nobody knows works. This is not
  hypothetical: nine of sixteen gates had no case at all while the documentation claimed
  each one was demonstrated, and the missing case for `docs:verify` was the one thing
  separating that gate from a check that a file exists.
- **Scope:** all
- **Enforced by:** `gates:selftest`, and `citations` at the plugin level, which fails when
  a rule cites a case the suite does not register
- **Proven by:** `pnpm selftest` → "citations: a rule with no selftest case fails",
  "citations: a selftest case the suite never registers fails". The rule's own proof is
  necessarily at the plugin level: a meta-rule about gates cannot be demonstrated by
  breaking one gate.
- **Decided in:** ADR 009

## §11 The decision table

`references/decision-table.md` holds the when→then table T1-T24: the deterministic core
of the pipeline. A generative decision traces either to a row of that table, to a fixed
rule in `SKILL.md`, or to a recorded `.prompts/` entry. Nothing else is a source.

### §11.1 Escalation

A facet the table does not cover escalates rather than being improvised: write the
ambiguity to `.prompts/` as an open question, emit a `proposed` ADR listing the options,
then pick the **most conservative, most standard** option and record why. Silence is not
an option, and neither is a guess.

## §12 Single sources of truth

### §12.2 Type and schema must not drift

**MUST.** A domain type is **derived** from its zod schema via `z.infer`, never
hand-written alongside it. Domain logic is pure and infrastructure-agnostic; persistence
sits behind a port.

- **Why:** A hand-duplicated type and its validator agree on the day they are written.
- **Enforced by:** `typecheck`, `consistency`
- **Decided in:** ADR 010 (prototype namespace)

### §12.3 The single-source registry

Each of these is defined exactly once in the tree, and `consistency` fails on a second
definition:

| Registry | Defined in |
| --- | --- |
| default locale (`DEFAULT_LOCALE`) | `src/i18n/config.ts` |
| design tokens (`tokens`) | `packages/proto-ui/tokens.ts` |
| environment schema (`EnvSchema`) | `src/config/env.ts` |
| route table (`routes`) | `src/app/routes.ts` (at most once; a minimal app may have none) |
| domain shape | the entity's zod schema, with its type derived (§12.2) |

## §13 Backend architecture

`Scope: backend` for §13–§16 — these sections bind the backend templates
(`kind: backend` in `references/templates.json`) and everything generated from them.

The architecture style is **derived, never chosen**: a pure function of the normalized
facets (T15–T17) over three counts — E = entities, X = external systems, C = connected
components of the entity reference graph — plus the messaging flag. First matching row
wins: hexagonal when `X ≥ 3 ∨ messaging = broker`; modular monolith when
`C ≥ 2 ∨ E ≥ 8`; layered otherwise. The derivation is recorded at generation time in
`.proto-forge/architecture.json` (`{ style, inputs: {E, X, C, flags} }`) and in the
template's pre-written ADR 005 (prototype namespace), and `arch:verify` re-derives it
from `facets.json` on every run — the selection rule is a gated fact, not
documentation. A brief demanding a contradicting style escalates (T22).

Every backend template ships ONE physical skeleton — `domain/`, `application/`,
`adapters/in/http/`, `adapters/out/persistence/`, `adapters/out/<external>/`,
`platform/` — and the style is an **enforcement profile** over it: which dependency
edges are legal (BR-21), how many modules exist, whether ports must be explicit
interfaces. The domain layer is framework-pure in every profile.

The `platform/` kernel (problem types, logging with redaction, security headers,
health endpoints) plus `scripts/` form the template's byte-pinned seed, with the same
`seed.lock` machinery as the web template's `packages/proto-ui` (§17.2).

## §14 Backend contract

The committed `contract/openapi.json` is a **locked derivation of the code** (BR-22) —
canonical JSON with sorted keys, so the artefact is deterministic without a YAML
serializer in the dependency budget:
regenerated from the route registry and schemas, normalized (sorted keys, version
noise stripped, one shared normalizer across stacks), diffed byte-wise, and pinned by
`contract/contract.lock` (sha256 + contract SemVer). It is re-locked in the same
accepted-ADR commit as the code that changed it. Every operation carries a stable,
deterministic `operationId` (BR-25); every error shape is a registered problem type
(RFC 9457, BR-23). A breaking contract change requires a contract major bump plus an
ADR — `contract:breaking` diffs against the last released contract with a pinned
`oasdiff` and fails otherwise.

The backend owns the contract; a paired frontend consumes the emitted artifact through
its BR-18 record and generates its typed client from that recorded copy.

## §15 Backend persistence and migrations

Migrations are **append-only** (BR-24): the migrations directory is history, and a
rewritten or deleted migration fails exactly as a rewritten prompt-log entry does.
The schema derivable from the migrations must agree with the ORM/model layer, checked
per stack (drizzle-kit diff / `flyway validate` + `ddl-auto=validate` / Alembic
autogenerate-empty). Persistence tests run against a **real Postgres engine** — an
in-memory reimplementation of Postgres is a mock of a first-party boundary and is
banned by BR-12's reasoning. At verify time the engine is in-process (PGlite for
node — actual Postgres compiled to WASM, running the shipped migrations), so `pnpm
verify` stays offline and Docker-free on every machine; deployments speak to a served
PostgreSQL through the same adapter, with only the injected driver differing. Where a
stack has no in-process engine, the real-database tier is Testcontainers in CI,
recorded per stack in §19.

## §16 Backend security baseline

The BRS §4 posture, restated for services: security headers from the `platform/`
kernel; schema validation on every route boundary (the route registry type requires
it); an authN/Z skeleton per the `authModel` facet with authorization asserted per
route in tests (T21); structured, PII-redacting logging only (NFR-12); secret scan
(gitleaks), dependency audit and SBOM per ecosystem — `pnpm audit` / OSV-Scanner over
the CycloneDX SBOM / `pip-audit` — with high/critical findings a hard stop, never
auto-suppressed; SAST per stack (eslint-security / SpotBugs+findsecbugs / bandit).

## §17 The plugin

`Scope: plugin` for this whole section.

### §17.1 Distribution

**MUST.** The plugin is installable from this repository alone. Its identity is stated in
four manifests that must agree on name and version: `package.json`, `skill.json`,
`plugin/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`. No manifest,
reference or instruction may point at a file the repository does not contain.

- **Why:** A plugin whose metadata lives on the author's machine cannot be installed,
  audited or released by anyone else.
- **Enforced by:** `manifest:lint`, `skill:lint`
- **Proven by:** `pnpm selftest` → the `manifest-lint` and `skill-lint` suites
- **Decided in:** ADR 002 (plugin namespace)

### §17.2 Seed provenance

**MUST.** The vendored `@jj/proto-ui` tree is byte-pinned: `.proto-forge/seed.lock`
holds its sha256, and `snapshot:diff` re-verifies it on every run. The seed is not
edited during generation — a hook blocks it. A legitimate upgrade is an ADR plus
`pnpm seed:lock`, never a way to make a red gate green.

- **Why:** The seed is the part of a prototype nobody re-reviews. Unpinned, it is the
  easiest place for a change to arrive unnoticed.
- **Enforced by:** `snapshot:diff`, `templates/web/scripts/hooks/guard-write.mjs`,
  `template:integrity` at the plugin level
- **Proven by:** `gates:selftest` → "snapshot: a missing seed.lock fails", "snapshot: a
  vendored seed that differs from seed.lock fails", "hook: editing the byte-pinned seed
  is blocked", "hook: an ordinary feature edit is allowed"
- **Decided in:** ADR 020, §8

## §18 Multi-template invariants

`Scope: plugin` for this section.

`references/templates.json` is the template registry: the single source every
plugin-level gate loops over (ADR 007 (plugin namespace)). Adding a template is one
registry entry plus the tree it names; `manifest:lint` then demands the complete shape
(a `verify` script, `gates-selftest`, `snapshot-diff`, the `.proto-forge` pins,
`docs/adr/`), `template:integrity` verifies its seed pin, and CI runs its
`verify-template` leg.

**Structural symmetry is mechanical, not aspirational.** A §10 rule binds the
templates its `Scope:` bullet names, and `citations` requires the rule's enforcer
script in EVERY covered template — so a gate that exists under one name in api-node
and another in api-java cannot pass. The phase numbering (0–9), the gate-failure
protocol, the waiver machinery, the prompt-log rules and the ADR bands hold verbatim
in every template; only per-phase content differs by kind.

**The gate corpus is Node everywhere.** Java and Python templates delegate
build/test/coverage/mutation/architecture checks to their native toolchains (Gradle,
uv), but the gates that orchestrate them — and every technology-neutral gate — are the
same `.mjs` scripts, so a generated backend repo pins node+pnpm alongside its own
toolchain (its ADR 009 (prototype namespace) records this). One gate framework is what
keeps `citations`, the selftest harness and the hook layer working identically across
four templates.

Backend gate selftests are two-tier: **Tier 1** fixture-directory cases run inside
`pnpm verify` (seconds, no JVM/pip); **Tier 2** (`gates:selftest:native`) builds real
throwaway Gradle/pytest projects and runs in CI only — the `verify-template`
precedent, recorded per stack in §19.

## §20 Environments and delivery

`Scope: frontend, backend` — every app template carries the same delivery surface,
and §18's symmetry machinery demands it stays identical by name (and, for the
shareable set, by byte — the plugin's `deploy:sync` gate).

The delivery environments are **local, dev, sit, uat, test, prod**, in that fixed
order (`ENV_ORDER` in `scripts/config.mjs`); the promotion chain IS the enabled
remote environments in that order (`promotionChain`), so it cannot drift from the
flags. `environments{}` in `.proto-forge/config.json` is the single declaration:
values files, the docs table and the delivery pipeline all derive from or are
checked against it. The template ships with **only `dev` enabled** — progressive
delivery is flipping flags in a reviewed config diff, never regenerating files.
`test` is the performance/pre-prod staging stop between `uat` and `prod`. Deploy
settings are operator configuration, never brief facets: they do not enter the
facet hash (BR-14).

Consent (the BR-20 model, extended): every remote deploy action is on
`guardrails.requireApproval` by default; `environments.<env>.autoDeploy: true` is
the committed standing consent standing in for the per-run `--approve` of
operator-script deploys and for nothing else; CI promotion is consented by the
committed workflow plus a protected GitHub environment for every env whose
`approval` is `required` — and prod's approval is not optional.

## §21 Supply chain and pipeline security

`Scope: frontend, backend`, like §20.

**Verify is offline; the world is a named CI stage.** No verify gate opens a
socket or needs a cluster: manifest validation runs against vendored schemas,
container linting is static, and the tool-gated checks (compose config, helm
lint/template + kubeconform, hadolint) follow the gitleaks pattern — enforce when
the binary is present, note locally when absent, hard-fail in CI. Everything that
builds, scans, signs, pushes or deploys an image lives in the delivery pipeline
under a named stage with a stated failure policy.

Containers run as no one in particular: non-root, no hardcoded UID (OpenShift
assigns one), read-only root filesystem, dropped capabilities, seccomp
RuntimeDefault, pinned-by-digest base images, resource limits and probes — one
image valid under an OpenShift restricted SCC and AKS baseline alike. Image scan
findings at or above the configured severity fail the pipeline; a `.trivyignore`
entry without a reason and an expiry date fails `deploy:verify`.

## §22 Requirements discovery

`Scope: plugin` for this section.

This section binds the discovery skill (`skills/discovery/`) and **every discovery
output**: the directory a run writes next to a brief, or `docs/discovery/` inside a
generated repo. A **conforming discovery run** is one where the copied
`.discovery/lint.mjs` exits 0 over the output directory; the plugin itself conforms
when the same implementation exits 0 over the shipped sample — that is the root
`discovery:lint` gate, part of `pnpm verify`. The rules are BR-30 through BR-33; the
deterministic core is the discovery skill's `references/discovery-table.md` (rows
D1–D9, the discovery analogue of §11's decision table), and the fixed question
taxonomy is `.discovery/questions.json` (Q1–Q24) — both are citation namespaces
`scripts/citations.mjs` resolves, so a prose reference to a row or question that
does not exist fails the build.

**Determinism, with its limits stated honestly.** Pinned — same sources yield the
same values: the unit tree and unit ids, their order, the testid reservations, the
question walk and its answered/gap/omitted classification, the table shapes, and the
counts. Not pinned: the prose inside SPIN and DAPA sections, which varies between
runs exactly as §8 allows for titles and comments. Figma bytes are pinned **by
record, not by reproduction**: `images.lock` fixes what was captured
(fileKey, nodeId, fileVersion, sha256); nobody claims Figma would render the same
pixels twice. Discovery documents are always English, whatever the brief's language
— an operator decision recorded in ADR 008 (plugin namespace).

**Timestamps are provenance, never inputs.** `capturedAt` in `images.lock` records
when a capture happened; no discovery gate reads the clock, so a re-run's verdict
cannot depend on the day it runs.

**The bridge does not touch brief identity.** `discovery.json` seeds Phase 0's
facet normalization and reserves Phase 4's testids, but the facet hash and BR-14
are untouched: the brief wins every conflict, a conflict the brief does not settle
escalates, and discovery provenance lives in the prompt log
(`.prompts/0003-discovery.md`), never in the identity.

## §23 Workspace composition

`Scope: workspace, e2e` for this section.

A brief that yields multiple parts composes them as ONE WORKSPACE (T14): a
`<project>/` directory that is itself a small git repository — carrying
`workspace.json`, the shared brief record and the orchestration scripts — which
`.gitignore`s the part directories, because every part (`api/`, `web/`, `e2e/`) is a
SEPARATE git repository with its per-repo machinery (verify, CI, prompt log,
commit discipline, snapshot) unchanged. `workspace.json` is the single source of
parts; every part's `facets.json` records the shared `pairedBrief` hash and a
present part whose hash disagrees fails. The e2e part is the cross-app layer:
a flow suite derived from the flows facets plus consumer-driven contract checks
replayed against the running pair — its static gates run in its own verify, and
the against-the-pair run is the workspace repository's orchestration (services
from `ws:up`), tool-gated locally and mandatory in the workspace CI.

## §24 Desktop applications

`Scope: desktop` for this section.

A desktop target is the web template's UI half inside a shell: the owned
component library, the i18n, testid, layering, overlay, harness, documentation,
coverage and mutation disciplines all apply unchanged, because the product is the
same product — only its delivery differs. What replaces the promotion chain
(§20 does not bind a desktop app: there is no environment to promote through) is
**packaging as a CI stage**: `tauri build` / `electron-builder` run per operating
system in the pipeline, never inside verify, which stays offline (NFR-16). Signing
and notarization are stated requirements per OS in the template's DELIVERY.md,
never secrets in a workflow.

The shell itself is configuration under a gate (BR-37). Two shells ship: Tauri
(the conservative default when a brief asks for a desktop app without naming one
— its capability model is deny-by-default) and Electron. A stated limit, recorded
rather than papered over: the end-to-end suite runs against the built web assets
in a browser, not against the packaged application — the packaged smoke belongs
to the packaging stage, and each template's ADR 203 says so in those words.

## §25 Security conformance

`Scope: plugin` for this section.

BRS §4 and §16 state a security baseline that is real, gate-enforced, and **defined by
itself**. That is enough to be secure and not enough to say so: "it is secure" cannot be
handed to a reviewer, an auditor or a customer as a claim they can re-check. §25 binds
the baseline to named external standards and makes the binding machine-readable.

**The bar.** OWASP ASVS 5.0 **Level 2** for the application (its L1 ∪ L2 set, 253 of 345
requirements), SLSA v1.1 **Build Level 3** for the supply chain, NIST SSDF SP 800-218 as
the process mapping. Level 2 rather than Level 3 deliberately: L3 asks for properties a
generated prototype cannot honestly claim — hardware key storage, environment
segregation, a per-feature formal threat model — and answering a third of a standard
with "not applicable" weakens a conformance claim more than a lower, fully-held bar
does. Level 3 is a per-project **ratchet** (`asvsLevel` in `.proto-forge/config.json`);
tightening is free, and dropping below the default is BR-17's waiver path.

**The standard is vendored, not transcribed.** `references/standards/asvs-5.0.0.flat.json`
is the published machine-readable release, pinned by tag (`v5.0.0_release`, never the
rolling `latest`) and by sha256. `references/security-controls.json` cites `req_id`s into
it; nothing copies a requirement number or its level.

**Conformance output is two artefacts, because it has to be.** `conformance.json` is the
CLAIM — derived only from repository content, byte-reproducible, its digest recorded in
`.proto-forge/snapshot.json`. `findings.sarif` is the OBSERVATION — what the scanners saw
at one moment, threshold-gated and never hashed. A single artefact mixing them would
either lie about determinism or omit findings: CVE feeds move under a fixed commit, so no
report embedding them can be byte-stable. BR-39 binds the claim half; the findings half
stays with `sec:scan`.

### BR-38 — Every security control cites a resolvable requirement, or admits it is ours

**MUST.** `references/security-controls.json` is the single source binding each control a
generated application carries to the standard requirement that asks for it. Every
`requires[]` entry naming ASVS resolves to a `req_id` in the vendored standard and sits at
or below the binding profile's level. The vendored standard matches its pinned sha256.
Every control binds at least one registered template kind or id. A control marked
`enforced` names the probe that proves it; one marked `planned` names the stage that will
and carries **no** probe. A control citing no standard requirement states a `rationale`.

- **Why:** The first draft of the design this rule comes from cited Trusted Types as an
  ASVS requirement (5.0 does not mention them anywhere), SRI at Level 2 (it is Level 3)
  and cookie attributes in V7 (they are in V3) — every number written from memory, every
  one plausible, none correct. A requirement id nobody can resolve is an id nobody
  checks, and a conformance claim built on unresolvable ids is worse than no claim: it
  reads as rigour. The `rationale` half closes the opposite leak — proto-forge tightens
  beyond ASVS in places (Trusted Types, Permissions-Policy, cross-origin isolation), and
  presenting our own strictness as someone else's requirement misleads the reader about
  what the standard demands. The `planned`-carries-no-probe rule keeps the catalogue from
  reading as coverage it does not have: an admitted gap is information, a probe that
  never runs is a lie with a green tick.
- **Scope:** plugin
- **Enforced by:** `security:catalogue`
- **Proven by:** `pnpm selftest` → "catalogue: a requirement id the standard does not
  contain fails", "catalogue: citing an L3 requirement under an L2 profile fails",
  "catalogue: a vendored standard that is not the pinned one fails", "catalogue: a
  control citing no standard and giving no rationale fails", "catalogue: a planned
  control carrying a probe fails", "catalogue: a control bound to a kind no template has
  fails"
- **Decided in:** ADR 013 (plugin namespace)

## §26 Documentation fidelity

Documentation in a generated application is not commentary on the code — it is part of
what ships, and the gates treat it that way already: a component page must exist, must
show the component, and must show **today's** code (BR-19); `docs/STATUS.md` is
re-rendered from the last green verify rather than typed (BR-36); the environment table
is derived from configuration; `docs/external/**` carries provenance. §26 closes the one
direction none of those cover.

**A page can be a faithful description of code that implements a decision nobody holds.**
Edit an ADR and leave the code alone: every source hash still matches, every screenshot
is still of current code, and the page now explains an application built on a decision
that changed. `commit-lint` does not catch it either — it checks that a commit flips
exactly one ADR to `accepted`, never that the documentation moved with it.

The mechanism is a **tree invariant, not a commit rule**. "A commit touching an ADR must
also touch its pages" cannot work: when only the ADR text changes, `docs:shots` produces
a byte-identical image and the lock does not move, so there is nothing to stage and the
gate would force a cosmetic edit — teaching people to add a space instead of writing
documentation. Recording the decision *in the lock* has neither problem, and it also
covers an ADR amended long after it was accepted, which a commit rule never would.

Delivery is staged (`docs/specs/2026-08-17-documentation-follows-reality-design.md`):
BR-42 binds every template whose documentation is generated from the code it describes:
`web` and the two desktop shells, where the artefact is a screenshot and the producer is
`docs:shots`, and the five `api-*` templates, where the artefact is a captured exchange
and the producer is `docs:examples`. `workspace` and `e2e` are outside it — they document
no subject that anchors a decision. A second rule then gives the
prose documents (`ARCHITECTURE.md`, `SECURITY.md`, `TROUBLESHOOTING.md`) the derived-block
treatment `STATUS.md` already has. That rule is written when its enforcer is, never
before: a register entry naming a gate nobody wrote is the gap this register exists to
close.

### BR-39 — The conformance claim is derived from the repository, and reproducible

**MUST.** A template's conformance claim (`.proto-forge/security/conformance.json`)
is **derived**, never written: every control in the vendored catalogue that binds this
template is answered by a probe that is a pure function of repository content — no
network, no clock, no environment (NFR-16) — and the report is regenerated and compared
byte-wise on every verify, the way `snapshot:diff` compares the structure. A probe that
does not hold fails the gate; a committed claim that the tree no longer derives fails
the gate; a catalogue naming a probe the template does not implement fails the gate.
The report carries no timestamp, no absolute path and no tool version, and its rows are
sorted, so two runs from the same tree produce identical bytes.

Scanner findings do **not** live in this artefact. They belong to `sec:scan` and to a
SARIF report, gated by threshold and never hashed.

- **Why:** "It is secure" is worth nothing to a reader who cannot re-check it, and a
  report generated once and committed is green forever regardless of what the code
  does afterwards — which is worse than no report, because it reads as evidence. The
  split between the claim and the findings is not tidiness: CVE feeds move under a
  fixed commit, so a single artefact containing both would have to choose between
  lying about determinism and omitting findings. The claim is the half that CAN be
  reproducible, so it is held to that; the findings are the half that cannot, so they
  are held to a threshold instead.
- **Scope:** web
- **Enforced by:** `sec:conformance`, with `sec:conformance:write` as the producer
- **Proven by:** `gates:selftest` → "conformance: a derived claim that matches the tree
  passes", "conformance: no committed claim at all fails", "conformance: a claim that no
  longer matches the tree fails", "conformance: a control whose probe stops holding
  fails", "conformance: a catalogue naming a probe this template lacks fails",
  "conformance: no catalogue at all fails"
- **Decided in:** ADR 013 (plugin namespace)

### BR-42 — A documented subject records the decision it was written against

**MUST.** Every documented subject's lock records, beside the source hash, the ADRs the
subject implements and a digest of each decision. The list is **derived** from the
`// @adr NNN` anchors in the subject's own sources, never hand-written. A subject that
anchors an ADR and has no lock fails; a subject whose recorded digest differs from the
ADR's current one fails, naming the ADR and the page. The digest covers the ADR from its
first `## ` heading down, so flipping `proposed → accepted` or backfilling a prompt-log
link — evidence moving, not the decision — does not stale anything.

- **Why:** Where documentation is a follow-up it does not happen, and BR-19 already says
  so about screenshots. The same is true one level up: a decision changes, the code
  follows, and the page explaining *why* stays behind describing an architecture nobody
  chose. Deriving the list from anchors rather than a `Docs:` field in the ADR is the
  point — a hand-written list is a second source of truth that drifts the moment an
  anchor moves, which is exactly what BR-15 exists to prevent. And because the only way
  to re-lock is `pnpm docs:shots`, re-photographing happens in the same act: "update the
  images too" is the mechanism rather than a rule someone has to remember.
- **Scope:** frontend, desktop, backend
- **Enforced by:** `docs:verify`, with `docs:shots` (frontend, desktop) and
  `docs:examples` (backend) as the producers that write the lock
- **Proven by:** `gates:selftest` → "docs: a subject written against the current decision
  passes", "docs: a subject written against an older decision fails", "docs: a subject
  implementing a decision with no lock at all fails", "docs: flipping an ADR's status does
  not stale the subject"
- **Decided in:** ADR 014 (plugin namespace)

## §19 Reconstruction notes

What the reconstruction could not establish from evidence, and what was done instead.
An empty list here would be the suspicious outcome, not the reassuring one.

### §19.1 Identifiers with no citation in the shipped artefacts

`BR-01`, `BR-03` and `BR-04` are cited nowhere in `SKILL.md`, `references/` or
`templates/web/`. No rule was written for them: inventing three rules to fill a numeric gap
would put text in a normative document that nothing in the repository asks for. The gap
in numbering is left visible, which is the honest record of a register that was
reconstructed rather than transcribed.

### §19.2 Sections whose meaning came from a single citation

`BRS §5` (application shell, from `templates/web/src/app/App.tsx`), `BRS §9.6` (ADR ranges,
from `references/decision-table.md`) and `BRS §11.1` (escalation, same file) each rest on
one citation site plus the code or table it names. Their scope here is exactly what
those sites demonstrate, no wider. If the original register said more under those
numbers, that content is lost and this document does not pretend otherwise.

### §19.3 The template's ADR set is a seed document

`SKILL.md` requires that an ADR is never deleted and that a reversal is a supersede.
That rule governs a **prototype's** history. `templates/web/docs/adr/` is not a history — it
is the design document a freshly generated prototype inherits. A seed decision that
changes is therefore rewritten in place, and the change is recorded in the plugin's own
`docs/adr/`. Shipping a `superseded by` trail into every new prototype would hand each
one a decision history it never made.

### §19.4 `sec:scan` is only half self-testable

The secret-scan half is asserted by `gates:selftest` → "security: the secret scan cannot
be skipped in CI". The dependency-audit half needs a registry and a real lockfile, so it
is exercised by CI running the actual gate rather than by a throwaway fixture. Stated
here rather than covered by a fixture that would only assert that `pnpm` is absent.

### §19.5 Two rules needed a number the original register did not supply

`BR-19` (documentation) and `NFR-25` (every gate has a demonstrated failure case) state
rules the repository already contained and already enforced — ADR 009 decides both,
`AGENTS.md` restates the first, and `docs:verify` and `gates:selftest` implement them —
but neither carried a `BR-` or `NFR-` citation anywhere, so the reconstruction had no
number to recover. New numbers were assigned rather than guessing that one of the uncited
`BR-01` / `BR-03` / `BR-04` had been the documentation rule: a wrong guess would put a
fabricated identity on a real rule, which is harder to notice than a new number.

Both were found by `citations` check 5 — a gate that no rule named — which is the check
working as intended on its first run.

### §19.6 `adr-lint` does not verify ADR bands

`references/decision-table.md` claimed "`adr-lint` fails any ADR outside its phase's
range". It does not, and it cannot as written: the bands in §9.6 map to a *kind* of
decision (domain entity, feature, security control), and an ADR file does not declare its
kind — so the only checkable statement would be "the number is between 001 and 199",
which is trivially true of every ADR the pipeline produces. The documentation was
corrected to state what is enforced (anchors, statuses, prompt-log links) rather than
implementing a check that would assert nothing. Band allocation remains a rule of the
pipeline, verified in review.

### §19.7 `test:mutation` has no throwaway-project selftest

Every other gate is proven by `gates:selftest` building a broken fixture and asserting
the exit code. A Stryker fixture would need a full dependency install per case, which
turns a seconds-long selftest into minutes of network I/O. The gate's failure mode is
instead demonstrated by its own `break` threshold — it exited non-zero on this
repository's first run at 74 % — and its wiring is covered by `citations` check 5,
which fails if the script exists with no rule behind it. Stated per NFR-25's own
escape: a limit is recorded here, not papered over with a fixture that proves only
that `pnpm` is absent.

### §19.8 `BR-11` describes a tension, not a mechanism

The rule states a goal — do not re-invent accessibility primitives, do not hard-depend
on a third party — and a mechanism chosen to serve it. The goal is the rule; the
mechanism is the ADR's, and an ADR may change it. It did: **ADR 021, the provider
selector, was retired in v0.4.0** when the owned top-layer overlay subsystem (ADR 008)
replaced the last third-party runtime, and no file carries the number — it stays
unused so a stale reference fails loudly instead of resolving to something else. The
ownership half of the decision lives in ADR 020, the layering mechanism in ADR 008.
BR-11 is recorded as **SHOULD** for that reason: what is gated is that the shared test
suite passes against whichever implementation the current decision selects.

### §19.9 The JVM, CPython and .NET real-database tiers are Testcontainers in CI

§15 wants the Postgres engine in-process at verify time, and for node it is
(PGlite). The JVM and CPython have no maintained in-process Postgres, and an
in-memory substitute is a BR-12 mock. Per §15's own escape, api-java's and
api-python's real-database tier runs over Testcontainers Postgres — Flyway
migrate + `ddl-auto=validate`, resp. `tests/integration` + `alembic check` — plus
each stack's `gates:selftest:native` Tier-2 suite proving the native gates fire:
mandatory in CI on a Docker-equipped runner, tool-gated locally with a printed
skip note. api-kotlin's tier is the same JVM story with one substitution stated
rather than smoothed: Exposed has no `ddl-auto=validate` to lean on, so
`PersistenceNativeTest` runs the committed Flyway history against Testcontainers
Postgres and then **reads the live catalog back through JDBC metadata**, asserting
each produced column and its SQL type against what the Exposed table declares
before driving the adapter through real queries — stricter in one useful way, since
a failure names the column and the type it actually found. api-dotnet's tier is
`tests/App.Tests/Persistence` (xUnit `Category=native`, `pnpm test:native`): EF Core
`Database.Migrate()` plus `HasPendingModelChanges()` against Testcontainers
Postgres, with its `gates:selftest:native` suite proving ArchUnitNET, the coverlet
threshold and the EF model-agreement check all fire.

How the adapter stays out of the unit-coverage floor differs by stack, and the
difference is worth stating rather than smoothing: api-java and api-python name a
reasoned exclusion entry, while api-dotnet's gated scope is an *include* list
(`[App]App.Domain.*,[App]App.Application.*`) — the adapter is outside it and the
template ships **zero** exclusions. api-kotlin takes a third route: the JaCoCo
floor is scoped to `app.domain` + `app.application` + `app.config` at 1.00
instruction/branch/line — the same set PIT mutates, so "the core" means one thing
rather than two — and the persistence adapter is simply outside it, but its `nativeTest`
execution data is **merged into the same report**, so where Docker exists the
adapter's coverage counts instead of being silently omitted. Each template's ADR
003/006 records its own mechanism. Mirrors §19.4/§19.7: the limit is stated, not
papered over.

### §19.10 Kotlin's two unkillable regions, named rather than excluded

api-kotlin meets the same 1.00 floor and the same mutation bar as its siblings, and
reaching them exposed two artefacts of the language rather than of the code.

**kotlinx.serialization's generated `$serializer` carries a dead branch.** The
plugin-generated decoder emits a missing-field path that no kotlinx decoder can
reach — roughly 6 % of instructions and 25 % of branches of unreachable bytecode
sitting inside a scope whose floor is 1.00. The template does not exclude it: the
wire types in `NoteWire.kt` carry **hand-written `KSerializer`s**, so the bytecode
under the floor is bytecode the tests can actually drive. Recorded in the
template's ADR 003.

**PIT cannot kill `kotlin.jvm.internal.Intrinsics` mutants.** Every non-null
parameter check the compiler inserts is a mutable call site with no observable
behaviour to assert on. `avoidCallsTo` names `Intrinsics` — the mutated *scope* is
unchanged, only the call class is skipped — and **both numbers are reported**: without
the filter PIT generated 29 mutations and killed 22 (76 %), all seven survivors that
one intrinsic; with it, 42 mutations and 42 kills (100 %). A single flattering number
would have been the papering-over; the pair is the record.

Widening that floor is the move this template makes when a package earns it:
`app.config` joined the enforced core once it reached 1.00 unaided, and the widening
went into the JaCoCo rule, the PIT scope **and** `coverage-policy.mjs` together — so
narrowing it back is a gate edit, not a build tweak.
