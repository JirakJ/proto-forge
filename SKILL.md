---
name: proto-forge
description: "Use when the user wants to scaffold or build a new web-app prototype, MVP, or first shippable product slice from a short brief — triggers on /proto-forge, \"forge a prototype\", \"scaffold an app\", \"build me a prototype/MVP\". Turns a product brief into a production-grade React 19 + TypeScript + Vite prototype with zero placeholders: owned component library, full unit/component/E2E tests, WCAG 2.2 AA a11y, fully-translated i18n, portalled overlays on one stacking scale, a documented + screenshotted component catalogue, a strict security baseline, per-ADR commits, an append-only prompt log, and a `pnpm verify` gate suite. Deterministic: the same normalized brief yields the same structure."
---

# proto-forge

Turn a short product brief into a **first shippable product slice** — it compiles, passes its own tests, and passes security + a11y + i18n + layering + documentation gates. Not a throwaway.

**Governing rule (determinism).** Every generative decision traces to either (a) a fixed rule in this file / `references/decision-table.md`, or (b) a recorded `.prompts/` entry. You fill *domain content inside a fixed skeleton*; you never reinvent the skeleton, file layout, test structure, or ADR numbering. The guarantee is **structural** determinism (same facets → same file tree / ADR set / components), not identical prose.

## When to use

User wants a new web prototype / MVP / app scaffold from a description. Web only (React 19 + TS + Vite). Not for: native mobile/desktop, backend services beyond a typed local adapter, or modifying an existing app.

## Inputs you need

A product brief (1 paragraph is enough). If the brief is missing entities, flows, roles, or persistence intent, do **not** guess — apply the escalation rule (Phase 0 / T-escalation).

## The pipeline — run phases in order, each gated

A phase does not start until the previous phase's gate is green. Every phase writes its prompt(s) to `.prompts/` **before** acting. Every ADR that reaches `accepted` becomes its own commit.

```
Phase 0  BRIEF INTAKE      → normalized facets + prompt-log seed
Phase 1  SCAFFOLD          → fixed repo skeleton (ADR 001-004)
Phase 2  DOMAIN MODEL      → typed domain + zod schemas (ADR 010-019)
Phase 3  COMPONENT LIBRARY → seed @jj/proto-ui + provider selector (ADR 020-021)
Phase 4  FEATURE BUILD     → features from library (ADR 030-099, loop)
Phase 5  I18N + A11Y PASS  → translate every locale + pseudo + axe (gate)
Phase 6  TEST BUILD        → unit + component + E2E (gate)
Phase 7  SECURITY HARDEN   → baseline controls + scans (ADR 100-199)
Phase 8  DOCS + SWEEP      → component catalogue, screenshots, dedup (gate)
Phase 9  RELEASE           → SemVer tag + changelog + SBOM + snapshot
```

### Phase 0 — Brief intake (the only interpretive step)

1. Choose the target directory: the kebab-slug of the first entity name (or `app` if the brief names none). **Copy `template/` byte-for-byte into it and work inside it** — `.prompts/` and `.proto-forge/` exist only after this copy, so the copy is the first action.
2. Write the raw brief verbatim to `.prompts/0002-brief.md` (id `0002`; the shipped `0001-scaffold.md` is the scaffold record — never reuse id `0001`) **before** generating any code.
3. Normalize into the typed facets in `references/facets.schema.ts`: `entities[]`, `flows[]`, `roles[]`, `persistence`, `apiContract?`, `locales[]`, `nonFunctional`.
   - Entity names → PascalCase; fields → camelCase. **No synonym invention.** No flow verb the brief didn't state.
   - `persistence`: an OpenAPI/endpoint reference ⇒ `api`; "save/store/persist" without a service ⇒ `local`; neither ⇒ `none`.
   - `locales`: every locale named in the brief. **Each one is a commitment to translate**, not to add a file — see Phase 5. If the brief names none, the prototype is `["en", "pseudo"]`.
   - Missing detail ⇒ escalation (below), never a guess.
4. Write facets to `.proto-forge/facets.json`; its hash is the **brief identity** (BR-14). Two briefs with the same facets are "the same brief."
5. Leave the shipped `.proto-forge/snapshot.json` in place; it is regenerated at the end of Phase 1 (after demo cleanup) and re-staged with every ADR commit.

**Escalation rule (T-escalation).** If a facet is not covered by T1-T13: (a) write the ambiguity to `.prompts/` as an open question, (b) emit a `proposed` ADR listing the options, (c) pick the **most conservative, most standard** option and record why. Never improvise silently.

### Phase 1 — Scaffold cleanup + shell regen (always)

The template is already copied (Phase 0). Remove the self-verifying demo **in full** and regenerate the shell, so nothing about the demo `Note` entity survives into the real prototype:

- **Delete (the complete demo set):** `src/features/_example/`, `src/domain/note/`, `src/infra/persistence/` (db, noteRepository, seed + tests), `e2e/notes.e2e.ts`, `docs/features/_example/` (the whole directory, README and any screenshots), ADRs `010-note-domain.md` / `022-persistence-adapter.md` / `030-example-feature.md`, and the `example.*` keys in every `src/i18n/locales/*.json`.
- **Regenerate** (these are regeneration points, NOT part of the byte-for-byte-immutable set): `src/app/App.tsx` (drop the `_example` import + its `<Route>`; keep the shell, `BrowserRouter`, `<ErrorBoundary>`, the landmark testids and the `*` → `NotFound` route — routed content is empty until Phase 4 adds real features), `src/app/App.test.tsx` (drop the notes/db assumptions — keep the shell-landmark + not-found assertions), `src/app/routes.ts` (as the brief needs).
- **Keep (immutable):** all of `packages/proto-ui/`, `src/app/ErrorBoundary.tsx`, `src/app/NotFound.tsx`, `src/app/ErrorBoundary.test.tsx`, `e2e/shell.e2e.ts`, `e2e/overlay.e2e.ts`, `src/gallery/` (the proto-ui cases are library fixtures, not demo content), `src/shared/SafeHtml.tsx`, `src/config/`, `src/i18n/` config, `docs/components/**`, `.claude/`, `AGENTS.md`, every config + gate script, and ADRs 001–009 (foundational, pre-written `accepted`).

After cleanup, run `pnpm snapshot` to regenerate `.proto-forge/snapshot.json`. Gate: `pnpm install && pnpm typecheck && pnpm build` exits 0.

### Phase 2 — Domain model (if brief names ≥1 entity, T3)

Per entity, in facet order, generate `src/domain/<entity>/{model.ts,schema.ts,repository.ts}`: TS type **derived** from the zod schema via `z.infer` (never hand-duplicated), a repository **port** (interface). One ADR per entity from range **010-019**.

### Phase 3 — Component library (always, T4/T5/T6)

The template already vendors `@jj/proto-ui` under `packages/proto-ui/` — Button, Field, Select, Checkbox, Dialog, Menu, Table, Tabs, ToastProvider, Portal, ProtoUIProvider (ADR 020 own library, 021 provider fallback, 008 layering — pre-written). The seed is byte-pinned: `.proto-forge/seed.lock` holds its sha256 and `snapshot:diff` re-verifies it every run (BRS §17.2) — **never edit files under `packages/proto-ui/` during generation** (a Claude Code hook blocks it); a legitimate seed upgrade = ADR + `pnpm seed:lock`. Wire the provider selector (`own` | `radix`). Then per `persistence`:
- `local` (T5) → real Dexie/IndexedDB adapter implementing the repository port. ADR 022.
- `api` (T6) → typed client from the contract + real local adapter behind the same port; zod-validate responses. ADR 023.

Seed data (if needed) lives **only** in `src/infra/**/seed.ts`, typed against the domain schema. Never inline literals in components/hooks.

**Never hand-roll an overlay.** Compose `Dialog`, `Menu` and `ToastProvider`. They portal to a body-level root and take their stacking values from `tokens.layer.*`; `layer:scan` rejects a fixed-position surface that skips the portal, and `component-dup-scan` rejects a raw element wearing a primitive role.

### Phase 4 — Feature build (per flow, T7 — loop)

For each `flows[]` entry, in order, allocate one ADR from **030-099** and build the feature. **Per-feature Definition of Done** (assert ALL before flipping the ADR to `accepted`):

- [ ] Built solely from `@jj/proto-ui` components (no duplicated primitive, no hand-rolled overlay).
- [ ] Every interactive and semantic element has a `data-testid` — interactive controls, headings, landmarks, list items, table cells, media, form parts, anything with a `role`. Namespaced by feature (`invoices-submit`, not `submit`), and **interpolated inside a `.map()`** (`` `invoice-${id}` ``).
- [ ] Any page the feature adds is a `<Route>` whose path comes from `src/app/routes.ts` (never a literal), reachable by deep link.
- [ ] Every user-visible string is a `t('...')` key — as JSX text **and** as a prop (`title`, `label`, `emptyLabel`, `errorMessage`, …) — present in the default locale and translated in every other one.
- [ ] Unit/component tests meet the feature-layer coverage floor (§3.1 of BRS).
- [ ] ≥1 Playwright E2E covering the happy path **and** primary error path, against real behavior.
- [ ] `axe` 0 serious/critical on the feature's pages; keyboard path verified in E2E.
- [ ] Inputs zod-validated at the boundary; no unvalidated external data enters the domain.
- [ ] `docs/features/<name>/README.md` written — API, testid map, i18n keys, a11y contract, VoiceOver smoke note — with a current screenshot or an explicit `<!-- no-screenshot: reason -->`.
- [ ] ADR anchored in code via `// @adr NNN - ...`; prompt-log entry referenced.
- [ ] The feature's commit passed all scoped gates before its ADR flipped to `accepted`.

If auth/roles are mentioned (T8): add `auth` port + real local impl + route guards + authz E2E. ADR from 040-049.

### Phase 5 — i18n + a11y pass (gate)

**Every locale in `locales[]` gets a real translation.** Adding `cs.json` with English values is the failure this gate exists to catch: `pnpm i18n:verify` fails on a missing key, an empty or placeholder value, a dropped `{{placeholder}}`, a plural form the language requires but the catalogue lacks, a catalogue nobody imports, a key no code uses, a computed `` t(`x.${y}`) `` without a declared key set, and on any value byte-identical to the default locale. If a value genuinely cannot differ — a product name, an acronym — record it in `src/i18n/identical-ok.json` with a reason; stale entries fail too.

Add each locale to `SUPPORTED_LOCALES` in `src/i18n/config.ts` **and** import it in `src/i18n/index.ts`. Regenerate `pseudo.json` with `pnpm i18n:extract`. Then run the axe integration in E2E. a11y strings (labels, `aria-live` messages) are i18n keys, never inline literals — enforced by lint across `src/**` and `packages/proto-ui/**`.

### Phase 6 — Test build (gate)

`pnpm test:unit` (coverage gate, layered thresholds) + `pnpm test:e2e`. Generate missing tests until floors are met. Tests assert **behavior** (Testing Library role/testid queries), never implementation details, never `vi.mock` of first-party modules. `src/test/setup.ts` asserts testid uniqueness in the rendered DOM after every test — a failure there means two elements share a name, not that the test is wrong.

### Phase 7 — Security harden (gate, T11)

Apply the BRS §4 baseline (already wired in the template): strict CSP, zod boundary validation, `SafeHtml` as the only sanitized-HTML entry point, no secrets, `pnpm audit` gate, security headers documented in `SECURITY.md`. Any control needing a design choice → ADR from **100-199**. Security scans (`gitleaks`, high/critical `audit`) **hard-stop** — never auto-suppress.

### Phase 8 — Documentation + consistency sweep (gate)

Add a gallery case to `src/gallery/cases.tsx` for every state worth showing, run `pnpm docs:shots`, then `pnpm docs:verify`: every exported component and every feature has a page, each page shows a screenshot that was taken from the **current** source, and no page is a stub. Editing a component invalidates its screenshots until `docs:shots` runs again.

Then `pnpm dup:scan` + `pnpm consistency`: no code clones >30 tokens (except library primitives), no local re-impl of a proto-ui primitive, no duplicate i18n values, no two `accepted` ADRs with opposing decisions lacking a supersede link, single-source-of-truth registry intact (default locale, tokens, env schema, domain types, route table each defined exactly once).

### Phase 9 — Release

SemVer tag; `CHANGELOG.md` from the ADR set + Conventional Commits; attach SBOM + `.proto-forge/snapshot.json` as artifacts. A `blocked` run (exhausted remediation, §gate-failure) is **never** tagged. If integrations are enabled, staged payloads are in `.proto-forge/outbox/` for an operator to review — never send them yourself.

## Configuration, waivers and guardrails

`.proto-forge/config.json` (merged over built-in strict defaults and `~/.config/proto-forge/config.json`) controls gate modes, integrations and guardrails. `pnpm config:show` prints what is in force; `pnpm config:check` runs first in `verify`.

**Tightening is free. Relaxing a mandatory gate is not.** i18n, testid, layer, docs, security, stub, consistency and snapshot may drop below `error` only with a `waivers[]` entry carrying a reason, an existing ADR and an expiry date. Without a live waiver the setting is ignored and the gate runs at `error` anyway; with one, the run is stamped `conformance: "waived"`, the relaxation prints on every verify, and it expires by itself. **Never propose a waiver as a way to make a red gate green** — it is for a recorded product decision (a single-locale pilot), and it needs the operator's agreement, not yours.

`.claude/settings.json` wires local hooks: they block edits to the byte-pinned seed and the append-only prompt log, block lowering a coverage threshold / budget ceiling / gate mode, block `--no-verify` and unlisted network hosts, run the structural scans after every TS edit, and sweep before the turn ends. `AGENTS.md` states the same rules in prose for CLIs that have no hook mechanism.

**Integrations are off by default and dry-run first.** With `integrations.jira.enabled` or `integrations.confluence.enabled` on, `pnpm sync:jira` / `pnpm sync:confluence` stage payloads into `.proto-forge/outbox/` and contact nothing. Live writes need `dryRun: false`, an open network guardrail with the host allowlisted, `--commit --approve`, and credentials from the env vars the config names. **No pipeline phase ever calls out** — generating a prototype must not file tickets or overwrite pages as a side effect.

## Gate-failure protocol

1. **Remediable gates** (coverage, lint, i18n keys, testid, docs/screenshots, budget): up to **2** targeted fix passes, each logged to `.prompts/` first. A pass may only *add* tests/translations/testids/docs or fix the flagged line — never lower a threshold, delete an assertion, add an `identical-ok` entry for a string that simply was not translated, or waive a gate.
2. **Hard-stop gates** (secrets, high/critical audit, contradiction): no auto-remediation. Stop, emit a `proposed` ADR describing the finding, surface to the operator.
3. **Exhaustion** ⇒ phase halts; run ends `blocked` in the snapshot (`gates[].result = "blocked"`), naming the failing gate + last prompt-log entry. No release tag.
4. A gate guarding a per-ADR commit runs **before** the commit is finalized; the ADR flips to `accepted` only when its commit's gates are green.

## ADR system & git workflow

- ADRs live in `docs/adr/NNN-kebab-title.md` (MADR template in `references/adr-template.md`). Lifecycle `proposed → accepted` (or `→ superseded by ADR-MMM`). Never delete; reversal = supersede.
- **Number ranges** (allocate by facet order, not as-encountered — this is load-bearing for BR-14):
  | Range | For |
  |---|---|
  | 001-009 | Foundational (stack, prompt-log, tests, i18n, routing, error boundary, performance budget, overlay layering, mandatory gates) — fixed at scaffold, **001-009 pre-written** |
  | 010-019 | Domain model (one per entity, facet order) |
  | 020-029 | Component library + providers + persistence/api adapters |
  | 030-039, 050-099 | Features (one per flow, facet order — **skip the 040-049 auth band**) |
  | 040-049 | Auth model + adapter (T8), only when auth/roles are in the brief |
  | 100-199 | Security design choices, budget changes, gate waivers |
  | 200+ | Post-v1 / supersedes / cross-cutting |

  The template's demo ADRs 010/022/030 are **deleted with the demo** in Phase 1, so real allocation starts fresh at the low end of each band (entity #1 → 010, first persistence adapter → 022, first feature → 030). Auth (model + adapter) lives only in 040-049; the feature loop skips that band.
- **In-code anchor:** exactly `// @adr 123 - implementation of <thing>`. Referenced ADR must exist and be `accepted`; every `accepted` ADR anchored ≥1×.
- **One accepted ADR = one commit**, containing the ADR transition + its code + tests + docs. Message:
  ```
  feat(scope): <imperative summary>

  Implements the decision in ADR NNN.

  ADR: NNN
  Prompt-Log: .prompts/NNNN-slug.md
  ```
  `commit-lint` verifies exactly one `ADR:` trailer, one status transition to `accepted` in the diff, and a resolving `Prompt-Log:` trailer.
- **Commit atomicity:** stage with ADR still `proposed` → regenerate + stage `.proto-forge/snapshot.json` (`pnpm snapshot`) so `snapshot:diff` compares against the snapshot committed in this same commit → run scoped gates → only if green, flip to `accepted` and finalize. Red ⇒ ADR stays `proposed`, no commit, gate-failure protocol takes over. An `accepted` ADR in history always corresponds to a commit whose gates passed.

## Prompt log (append-only)

- One Markdown file per prompt in `.prompts/`, named `NNNN-slug.md` (zero-padded, monotonic), with frontmatter `id/timestamp/phase/adr/author` + `## Prompt` (verbatim) + `## Outcome` (1-3 lines).
- **Append-only:** existing files immutable (CI diff check + a local hook). Corrections = new entries referencing the prior `id`.
- **Precedence:** prompt written **before** the resulting code/ADR is committed.
- **Linkage:** every `accepted` ADR references ≥1 prompt-log entry; every ADR-producing entry names its ADR.
- **Redaction:** before writing an entry, replace secret-shaped values (tokens/keys/connection strings/bearer creds) with `«redacted:<type>»`; PII with `«redacted:pii»` unless the brief marks it non-sensitive fixture data. `.prompts/**` is scanned by `secret-scan` like `src/**`.

## Gate commands (all in `template/package.json`)

`verify` runs all, fail-fast:
`config:check` · `gates:selftest` · `lint` · `typecheck` · `test:unit` · `build` · `budget` · `i18n:verify` · `layer:scan` · `testid:scan` · `docs:verify` · `stub:scan` · `adr:lint` · `prompt:lint` · `dup:scan` · `consistency` · `sec:scan` · `snapshot:diff` · `test:e2e`.

Supporting commands: `config:show` · `docs:shots` · `i18n:extract` · `snapshot` · `seed:lock` · `sync:jira` · `sync:confluence`.

`gates:selftest` builds a throwaway project per failure mode and asserts every gate's exit code — run it after touching any scan script.

`budget` (ADR 007) gzips the built `dist/` assets and enforces 300 kB JS / 60 kB CSS / 250 kB per chunk, and refuses to measure a gallery build. It is a **remediable** gate — trim or split, never raise the ceiling; a real budget change is an ADR from 100-199 plus the constant in `scripts/budget.mjs`.

## Fixture vs mock — the exact line (BR-12)

Real (allowed): a Dexie store that genuinely persists/queries/enforces schema; a one-time typed **seed dataset** in `src/infra/**/seed.ts`; a zod-validated typed API client; fixtures under `**/__fixtures__/` imported **only** by `*.test.*`/`*.e2e.*`; the component gallery in `src/gallery/**`, which is a screenshot catalogue and never in a production build.
Banned: hardcoded literals ignoring arguments; inline `return [{id:1,...}]` in a component/hook; `vi.mock`/`jest.mock` of first-party paths; `__fixtures__` imports in production `src/`; `throw new Error("not implemented")`; lorem/`TODO`/`FIXME`.

## Reference files

- `references/facets.schema.ts` — the canonical brief schema (Phase 0 target).
- `references/decision-table.md` — T1-T13 when→then + escalation + ADR ranges.
- `references/adr-template.md` — the MADR ADR skeleton.
- `template/` — the fixed skeleton copied per run. Read `template/README.md` for its layout and `template/AGENTS.md` for the rules every change must satisfy.

## Full requirements

The process mechanics — phase order, the copy-first rule, the full demo-deletion set, ADR-band allocation (incl. the auth-band skip), prompt-log numbering, snapshot cadence, and target-directory naming — are defined **here and in `references/decision-table.md`**. Do not defer them elsewhere; they are deterministic and belong in the skill. Only genuine *domain-requirement* ambiguity (what the product should do) escalates per the escalation rule.

This skill implements BRS-PROTO-FORGE-001 v1.2.0; P0 scope + deliberate trims are recorded in `~/work/docs/superpowers/specs/2026-07-05-proto-forge-design.md`.
