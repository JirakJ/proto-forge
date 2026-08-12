# BRS-PROTO-FORGE-001 — requirements register

The normative source for every `BR-xx`, `NFR-xx` and `BRS §x.y` citation in this
repository: in `SKILL.md`, in `references/`, in the template's source comments, gate
scripts and ADRs.

**This document was reconstructed.** The register it replaces lived outside the
repository, and the only pointer to it was a path on one machine — so ~150 citations
resolved to nothing a reader could open. It is rebuilt from the artefacts that
implement it, in this order of evidence: the ADR that states a decision, the gate
script that enforces it, the source comment at the citation site, and `SKILL.md` /
`template/AGENTS.md`, which restate many rules for their own audiences. No rule here
was invented; §19 records every place the evidence was thin and what was done about it.

Section numbers are **not** free to change. Fifteen citations point at `BRS §x.y`
anchors, so this document adopts that outline rather than a tidier one, and
`scripts/citations.mjs` resolves against these headings.

## §1 Scope and conformance

This register binds two things:

- **the skill** — the pipeline in `SKILL.md` and the decision table in
  `references/decision-table.md`. Rules marked `Scope: plugin` apply here.
- **the prototype** — anything generated from `template/`. Everything else applies here.

A **conforming run** is one where `pnpm verify` exits 0 in the generated prototype and
`.proto-forge/snapshot.json` records `conformance: "strict"`. A run may also be
conforming while stamped `conformance: "waived"`, which means a mandatory gate was
relaxed through a live `waivers[]` entry carrying a reason, an existing ADR and an
expiry date (BR-17). Any other state is non-conforming, and a run whose remediation
was exhausted ends `blocked` and is never released.

A **conforming plugin** is one where `pnpm verify` and `pnpm verify:template` both exit
0 at the repository root.

Requirement levels are **MUST** (a gate fails on violation) and **SHOULD** (reviewed,
not gated). There are no unenforced MUSTs: `scripts/citations.mjs` fails when a rule
names no enforcer, and when a gate is named by no rule.

## §2 Definitions

**Prototype** — a web application slice generated from `template/` by the pipeline in
`SKILL.md`. It compiles, passes its own tests, and passes its own gates.

**Seed** — the vendored `@jj/proto-ui` tree under `template/packages/proto-ui/`. It is
byte-pinned (§17.2) and is not edited during generation.

**Facet** — a normalized field of the brief, typed by `references/facets.schema.ts`.
The hash of the facet set is the *brief identity* (BR-14).

**Gate** — a script named in `template/package.json` that exits non-zero on a violation.
A **mandatory gate** is one listed in `MANDATORY_GATES` (`template/scripts/config.mjs`);
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

### §3.1 Coverage by architectural boundary

Coverage thresholds are set per glob and enforced by Vitest's V8 provider, configured
in `template/vite.config.ts`. Thresholds are a floor, never a target: a file below its
layer's floor fails the gate.

Lowering a threshold is blocked by a hook (`template/scripts/hooks/guard-write.mjs`)
and, where the hook does not run — CI — by the gate itself. A genuine change to a floor
is an ADR.

Exclusions are enumerated, not open-ended. A path is excluded only when it contains no
executable product code (type declarations), is a fixture catalogue, or is the
bootstrap entry whose behaviour is covered end-to-end instead.

- **Enforced by:** `test:unit` (per-glob V8 thresholds), `lint`
- **Proven by:** `gates:selftest` → "hook: lowering a coverage threshold is blocked"

## §4 Security

The baseline below is wired into the template and is not optional. Two of its gates —
the secret scan and the high/critical dependency audit — are **hard-stop**: they are
never auto-suppressed, never waived, and a finding halts the run for a human.

### §4.1 Application controls

**MUST**, all of them:

- A strict Content Security Policy. Production serves `script-src 'self'`; the dev
  server relaxes it only because Vite injects an inline react-refresh preamble.
  Configured in `template/vite.config.ts`, documented in `template/docs/SECURITY.md`.
- Security headers: `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`,
  `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`.
- Environment configuration is validated with zod at the boundary
  (`template/src/config/env.ts`). Nothing reads `import.meta.env` directly.
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
- **Enforced by:** `adr:lint`
- **Proven by:** `gates:selftest` → "adr: an anchored, accepted, prompt-linked ADR
  passes", "adr: an anchor to an ADR that does not exist fails", "adr: an anchor to a
  proposed ADR fails", "adr: an accepted ADR nobody anchored fails", "adr: an accepted
  ADR with no prompt-log back-reference fails", "adr: a prompt-log reference pointing at
  nothing fails"
- **Decided in:** ADR 002 (prototype namespace)

### BR-06 — One accepted ADR is one commit

**MUST.** A commit that accepts an ADR carries a Conventional Commits subject, exactly
one `ADR:` trailer, exactly one status transition to `accepted` in its diff, and a
resolving `Prompt-Log:` trailer.

- **Why:** A decision spread over several commits cannot be reverted as a decision, and
  a commit accepting two decisions makes the gates that guarded it ambiguous.
- **Enforced by:** `commit-lint` via the `commit-msg` hook
- **Proven by:** `gates:selftest` → "hook: --no-verify is blocked" (the bypass that
  would make this rule optional)
- **Decided in:** ADR 002 (prototype namespace)

### BR-07 — Code is English-only

**MUST.** Identifiers, comments and string literals in code are English. Locale
catalogues are exempt, and `pseudo` is deliberately decorated.

- **Why:** A mixed-language codebase costs every later reader, and a non-English literal
  in code is almost always a string that should have been a catalogue key (BR-08).
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
- **Enforced by:** `lint` (`i18next/no-literal-string`, `local/no-user-facing-literal`),
  `i18n:verify`
- **Proven by:** `gates:selftest` → the i18n suite, in particular "i18n: an untranslated
  value copied from English fails" and "i18n: an allowlisted proper noun may stay
  identical"
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
- **Enforced by:** `dup:scan`, which runs jscpd for clones and component-dup-scan for
  re-implemented primitives
- **Proven by:** `gates:selftest` → "dup: a feature composing proto-ui primitives
  passes", "dup: a raw <button> in a feature fails", "dup: a raw element wearing a
  primitive role fails"
- **Decided in:** ADR 020

### BR-11 — Hard accessibility primitives are not re-invented, and not depended on

**SHOULD.** The owned library must not re-implement solved accessibility problems from
scratch, and must not hard-depend on a third-party runtime to solve them either. Where
both pull, the resolution is recorded as a decision rather than left to preference.

- **Why:** Writing a focus trap by hand reproduces known bugs; hard-depending on a
  headless UI library contradicts the owned-library claim and NFR-02.
- **Enforced by:** ADR review; the shared component test suite, which must pass against
  whatever implementation the current decision selects
- **Proven by:** the primitive test suites under `packages/proto-ui/src/**`, which are
  the same suite regardless of implementation
- **Decided in:** ADR 021

### BR-12 — No mock data and no stubbed dependencies in delivered code

**MUST.** The fixture/mock line is defined in §2. Production code contains no banned
marker (`TODO`, `FIXME`, `XXX`, `HACK`, `not implemented`, `unimplemented`, `lorem
ipsum`), pulls in no `__fixtures__` module, and no source file anywhere mocks a
first-party path (`@/`, `@jj/`, relative).

- **Why:** A prototype whose persistence is faked has not demonstrated the thing a
  prototype exists to demonstrate. And a test that mocks its own module under test
  asserts the mock.
- **Enforced by:** `stub:scan`
- **Proven by:** `gates:selftest` → "stub: clean production code passes", "stub: a
  banned marker in production code fails", "stub: 'not implemented' in production code
  fails", "stub: mocking a first-party module fails", "stub: pulling __fixtures__ into
  production code fails"
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
- **Enforced by:** `prompt:lint` for structure, a git-history diff in CI for
  append-only, and `template/scripts/hooks/guard-write.mjs` locally
- **Proven by:** `gates:selftest` → "prompt: well-formed, strictly increasing entries
  pass", "prompt: an empty log fails", "prompt: a filename that is not NNNN-slug.md
  fails", "prompt: an id that disagrees with the filename fails", "prompt: an entry with
  no ## Prompt section fails", "prompt: ids that do not strictly increase fail", "hook:
  rewriting an existing prompt-log entry is blocked", "hook: adding a NEW prompt-log
  entry is allowed"
- **Decided in:** ADR 002 (prototype namespace)

### BR-14 — Brief identity is the facet hash

**MUST.** Two briefs whose normalized facets are equal are the same brief, and produce
the same structure (§8). The hash of `.proto-forge/facets.json` is that identity. ADR
numbers are allocated by facet order rather than by encounter order, so the ADR set is a
function of the facets.

- **Why:** "Deterministic" has to mean something checkable. Structure is checkable; prose
  is not.
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
- **Enforced by:** `consistency`
- **Proven by:** `gates:selftest` → "consistency: one definition per single-source
  registry passes", "consistency: design tokens defined twice fails", "consistency: two
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
- **Enforced by:** `config:check`, every gate through `gateResult`, and
  `template/scripts/hooks/guard-write.mjs`
- **Proven by:** `gates:selftest` → "config: the strict default passes", "config:
  relaxing a mandatory gate without a waiver fails", "config: a complete waiver passes
  and is reported", "config: a waiver citing an ADR that does not exist fails", "config:
  a waiver with no real justification fails", "config: a waiver for a gate that is not
  relaxed fails as dead paperwork", "hook: switching a gate to warn in the config is
  blocked", "hook: lowering a coverage threshold is blocked"
- **Decided in:** ADR 009

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
- **Enforced by:** `docs:verify`
- **Proven by:** `gates:selftest` → "docs: a page that states why there is no screenshot
  passes", "docs: a component with no page fails", "docs: a stub page fails", "docs: a
  page with neither a screenshot nor a stated reason fails", "docs: a page referencing a
  screenshot that is not on disk fails", "docs: screenshots with nothing recording which
  code they show fail", "docs: a screenshot taken from older code fails"
- **Decided in:** ADR 009

### NFR-02 — No heavy runtime UI dependency

**MUST.** The prototype ships no component-framework runtime beyond React. The owned
library has zero runtime dependencies of its own.

- **Why:** A prototype that pulls a full design-system runtime cannot demonstrate its own
  performance budget, and the budget is what makes the claim checkable.
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
- **Enforced by:** `lint` (`boundaries/element-types`)
- **Proven by:** `lint` running over the template's own tree, which contains one module
  per layer
- **Decided in:** ADR 001

### NFR-08 — The toolchain is pinned and reproducible

**MUST.** Node and pnpm versions are pinned (`engines`, `packageManager`, `.nvmrc`); the
lockfile is committed; CI installs with `--frozen-lockfile`.

- **Why:** A prototype that builds differently on two machines has not demonstrated it
  builds.
- **Enforced by:** `sec:scan` (audit against the committed lockfile), CI's
  `--frozen-lockfile` install, `template:integrity` at the plugin level
- **Proven by:** `gates:selftest` → "security: the secret scan cannot be skipped in CI"
- **Decided in:** ADR 001

### NFR-09 — Provenance adds no runtime dependency

**MUST.** The prompt log is plain Markdown in the repository. It reviews in an ordinary
diff, versions with the code it produced, and requires no service.

- **Why:** Provenance stored in a system the repository does not contain is provenance
  that disappears when access does.
- **Enforced by:** `prompt:lint`; the absence of any dependency to enforce
- **Proven by:** `gates:selftest` → "prompt: well-formed, strictly increasing entries pass"
- **Decided in:** ADR 002 (prototype namespace)

### NFR-10 — Provenance is tamper-evident

**MUST.** Every prompt that shaped the code is recorded, and the record cannot be
rewritten without leaving evidence: append-only is checked against git history in CI and
blocked locally by a hook.

- **Why:** A log that can be edited after the fact tells you what someone wishes had
  happened.
- **Enforced by:** the CI history diff, `template/scripts/hooks/guard-write.mjs`
- **Proven by:** `gates:selftest` → "hook: rewriting an existing prompt-log entry is
  blocked", "hook: adding a NEW prompt-log entry is allowed"
- **Decided in:** ADR 002 (prototype namespace)

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
- **Enforced by:** `layer:scan` (one dismiss owner, one reader of the fallback scale, one
  adapter for platform calls), `lint`
- **Proven by:** `gates:selftest` → "layer: a library surface without a slot fails (rule 4)",
  "layer: a second document keydown listener in the library fails (rule 5)", "layer: reading
  the overlay base outside OverlayStack fails (rule 6)", "layer: a platform top-layer call
  outside the adapter fails (rule 9)"
- **Decided in:** ADR 008

### NFR-21 — Open for a new kind of surface, closed for edits to the old ones (OCP)

**MUST.** Adding a kind of overlay is a new composition of the existing hooks, not an
edit to the primitives that already exist. A new kind arrives with its own tests, harness
case and documentation, and it does not change the behaviour of any other kind.

- **Why:** A per-kind stacking scale is the anti-pattern this replaces: adding a fifth
  surface meant re-deciding where the other four paint, and every such decision was a
  chance to invert two of them.
- **Enforced by:** `dup:scan`, `docs:verify`
- **Proven by:** `gates:selftest` → "dup: a feature composing proto-ui primitives passes",
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
- **Enforced by:** `lint` (`boundaries/element-types`), `typecheck`, `consistency`
- **Proven by:** `lint` and `typecheck` running over the template's own tree, which
  contains one module per layer, plus the overlay suite's "keeps two provider trees
  independent" and "uses the capabilities it is given rather than detecting them"
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
- **Enforced by:** `typecheck`, `lint`
- **Proven by:** `typecheck` over the template's own tree, plus the overlay suite's
  "survives a view missing each constructor entirely"
- **Decided in:** ADR 008

### NFR-24 — One contract, interchangeable surfaces (LSP)

**MUST.** Every overlay satisfies one `OverlaySurface` contract — kind, open, dismissal,
testid — so a caller that can drive one can drive any of them. This is what makes a single
generated browser suite able to exercise every surface rather than one hand-written spec
per component.

- **Why:** Where two implementations of "the same" component differed on the property that
  mattered most — one portalled and one did not — the claim "the same tests pass under
  both" was false exactly where it was load-bearing.
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
- **Enforced by:** `gates:selftest`, and `citations` at the plugin level, which fails when
  a rule cites a case the suite does not register
- **Proven by:** `pnpm selftest` → "citations: a rule with no selftest case fails",
  "citations: a selftest case the suite never registers fails". The rule's own proof is
  necessarily at the plugin level: a meta-rule about gates cannot be demonstrated by
  breaking one gate.
- **Decided in:** ADR 009

## §11 The decision table

`references/decision-table.md` holds the when→then table T1-T13: the deterministic core
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
- **Enforced by:** `snapshot:diff`, `template/scripts/hooks/guard-write.mjs`,
  `template:integrity` at the plugin level
- **Proven by:** `gates:selftest` → "snapshot: a missing seed.lock fails", "snapshot: a
  vendored seed that differs from seed.lock fails", "hook: editing the byte-pinned seed
  is blocked", "hook: an ordinary feature edit is allowed"
- **Decided in:** ADR 020, §8

## §19 Reconstruction notes

What the reconstruction could not establish from evidence, and what was done instead.
An empty list here would be the suspicious outcome, not the reassuring one.

### §19.1 Identifiers with no citation in the shipped artefacts

`BR-01`, `BR-03` and `BR-04` are cited nowhere in `SKILL.md`, `references/` or
`template/`. No rule was written for them: inventing three rules to fill a numeric gap
would put text in a normative document that nothing in the repository asks for. The gap
in numbering is left visible, which is the honest record of a register that was
reconstructed rather than transcribed.

### §19.2 Sections whose meaning came from a single citation

`BRS §5` (application shell, from `template/src/app/App.tsx`), `BRS §9.6` (ADR ranges,
from `references/decision-table.md`) and `BRS §11.1` (escalation, same file) each rest on
one citation site plus the code or table it names. Their scope here is exactly what
those sites demonstrate, no wider. If the original register said more under those
numbers, that content is lost and this document does not pretend otherwise.

### §19.3 The template's ADR set is a seed document

`SKILL.md` requires that an ADR is never deleted and that a reversal is a supersede.
That rule governs a **prototype's** history. `template/docs/adr/` is not a history — it
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

### §19.7 `BR-11` describes a tension, not a mechanism

Its evidence (ADR 021, the provider selector) states a goal — do not re-invent
accessibility primitives, do not hard-depend on a third party — and a mechanism chosen
to serve it. The goal is the rule; the mechanism is the ADR's, and an ADR may change it.
BR-11 is recorded as **SHOULD** for that reason: what is gated is that the shared test
suite passes against whichever implementation the current decision selects.
