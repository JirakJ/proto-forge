---
name: proto-forge
description: "Use when the user wants to scaffold or build a new web-app prototype, MVP, or first shippable product slice from a short brief — triggers on /proto-forge, \"forge a prototype\", \"scaffold an app\", \"build me a prototype/MVP\". Turns a product brief into a production-grade React 19 + TypeScript + Vite prototype with zero placeholders: owned component library, full unit/component/E2E tests, WCAG 2.2 AA a11y, i18n from day one, a strict security baseline, per-ADR commits, an append-only prompt log, and a `pnpm verify` gate suite. Deterministic: the same normalized brief yields the same structure."
---

# proto-forge

Turn a short product brief into a **first shippable product slice** — it compiles, passes its own tests, and passes security + a11y + i18n gates. Not a throwaway.

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
Phase 5  I18N + A11Y PASS  → externalize + pseudo + axe (gate)
Phase 6  TEST BUILD        → unit + component + E2E (gate)
Phase 7  SECURITY HARDEN   → baseline controls + scans (ADR 100-199)
Phase 8  CONSISTENCY SWEEP → dedup + contradiction scan (gate)
Phase 9  RELEASE           → SemVer tag + changelog + SBOM + snapshot
```

### Phase 0 — Brief intake (the only interpretive step)

1. Choose the target directory: the kebab-slug of the first entity name (or `app` if the brief names none). **Copy `template/` byte-for-byte into it and work inside it** — `.prompts/` and `.proto-forge/` exist only after this copy, so the copy is the first action.
2. Write the raw brief verbatim to `.prompts/0002-brief.md` (id `0002`; the shipped `0001-scaffold.md` is the scaffold record — never reuse id `0001`) **before** generating any code.
3. Normalize into the typed facets in `references/facets.schema.ts`: `entities[]`, `flows[]`, `roles[]`, `persistence`, `apiContract?`, `locales[]`, `nonFunctional`.
   - Entity names → PascalCase; fields → camelCase. **No synonym invention.** No flow verb the brief didn't state.
   - `persistence`: an OpenAPI/endpoint reference ⇒ `api`; "save/store/persist" without a service ⇒ `local`; neither ⇒ `none`.
   - Missing detail ⇒ escalation (below), never a guess.
4. Write facets to `.proto-forge/facets.json`; its hash is the **brief identity** (BR-14). Two briefs with the same facets are "the same brief."
5. Leave the shipped `.proto-forge/snapshot.json` in place; it is regenerated at the end of Phase 1 (after demo cleanup) and re-staged with every ADR commit.

**Escalation rule (T-escalation).** If a facet is not covered by T1-T13: (a) write the ambiguity to `.prompts/` as an open question, (b) emit a `proposed` ADR listing the options, (c) pick the **most conservative, most standard** option and record why. Never improvise silently.

### Phase 1 — Scaffold cleanup + shell regen (always)

The template is already copied (Phase 0). Remove the self-verifying demo **in full** and regenerate the shell, so nothing about the demo `Note` entity survives into the real prototype:

- **Delete (the complete demo set):** `src/features/_example/`, `src/domain/note/`, `src/infra/persistence/` (db, noteRepository, seed + tests), `e2e/notes.e2e.ts`, `docs/features/_example.md`, ADRs `010-note-domain.md` / `022-persistence-adapter.md` / `030-example-feature.md`, and the `example.*` keys in `src/i18n/locales/{en,pseudo}.json`.
- **Regenerate** (these are regeneration points, NOT part of the byte-for-byte-immutable set): `src/app/App.tsx` (drop the `_example` import + `<NotesFeature/>`; mount an empty `<main>` until Phase 4 adds real features), `src/app/App.test.tsx` (drop the notes/db assumptions — assert only the shell landmarks + skip link), `src/app/routes.ts` (as the brief needs).
- **Keep (immutable):** all of `packages/proto-ui/`, `src/shared/SafeHtml.tsx`, `src/config/`, `src/i18n/` config, every config + gate script, and ADRs 001–004 (foundational, pre-written `accepted`).

After cleanup, run `pnpm snapshot` to regenerate `.proto-forge/snapshot.json`. Gate: `pnpm install && pnpm typecheck && pnpm build` exits 0.

### Phase 2 — Domain model (if brief names ≥1 entity, T3)

Per entity, in facet order, generate `src/domain/<entity>/{model.ts,schema.ts,repository.ts}`: TS type **derived** from the zod schema via `z.infer` (never hand-duplicated), a repository **port** (interface). One ADR per entity from range **010-019**.

### Phase 3 — Component library (always, T4/T5/T6)

The template already vendors `@jj/proto-ui` under `packages/proto-ui/` (ADR 020 own library, 021 provider fallback — pre-written). The seed is byte-pinned: `.proto-forge/seed.lock` holds its sha256 and `snapshot:diff` re-verifies it every run (BRS §17.2) — **never edit files under `packages/proto-ui/` during generation**; a legitimate seed upgrade = ADR + `pnpm seed:lock`. Wire the provider selector (`own` | `radix`). Then per `persistence`:
- `local` (T5) → real Dexie/IndexedDB adapter implementing the repository port. ADR 022.
- `api` (T6) → typed client from the contract + real local adapter behind the same port; zod-validate responses. ADR 023.
Seed data (if needed) lives **only** in `src/infra/**/seed.ts`, typed against the domain schema. Never inline literals in components/hooks.

### Phase 4 — Feature build (per flow, T7 — loop)

For each `flows[]` entry, in order, allocate one ADR from **030-099** and build the feature. **Per-feature Definition of Done** (assert ALL before flipping the ADR to `accepted`):

- [ ] Built solely from `@jj/proto-ui` components (no duplicated primitive).
- [ ] Every interactive element has a stable `data-testid`.
- [ ] All user-visible strings are `t('...')` keys present in `en` **and** rendering under `pseudo`.
- [ ] Unit/component tests meet the feature-layer coverage floor (§3.1 of BRS).
- [ ] ≥1 Playwright E2E covering the happy path **and** primary error path, against real behavior.
- [ ] `axe` 0 serious/critical on the feature's pages; keyboard path verified in E2E.
- [ ] Inputs zod-validated at the boundary; no unvalidated external data enters the domain.
- [ ] Feature doc under `docs/features/` incl. a VoiceOver smoke note.
- [ ] ADR anchored in code via `// @adr NNN - ...`; prompt-log entry referenced.
- [ ] The feature's commit passed all scoped gates before its ADR flipped to `accepted`.

If auth/roles are mentioned (T8): add `auth` port + real local impl + route guards + authz E2E. ADR from 040-049.

### Phase 5 — i18n + a11y pass (gate)

Run `pnpm i18n:verify` (missing/orphan keys + pseudo render) and the axe integration in E2E. a11y strings (labels, `aria-live` messages) are i18n keys, never inline literals — enforced by the component template.

### Phase 6 — Test build (gate)

`pnpm test:unit` (coverage gate, layered thresholds) + `pnpm test:e2e`. Generate missing tests until floors are met. Tests assert **behavior** (Testing Library role/testid queries), never implementation details, never `vi.mock` of first-party modules.

### Phase 7 — Security harden (gate, T11)

Apply the BRS §4 baseline (already wired in the template): strict CSP, zod boundary validation, `SafeHtml` as the only sanitized-HTML entry point, no secrets, `pnpm audit` gate, security headers documented in `SECURITY.md`. Any control needing a design choice → ADR from **100-199**. Security scans (`gitleaks`, high/critical `audit`) **hard-stop** — never auto-suppress.

### Phase 8 — Consistency sweep (gate)

`pnpm dup:scan` + `pnpm consistency`: no code clones >30 tokens (except library primitives), no local re-impl of a proto-ui primitive, no duplicate i18n values, no two `accepted` ADRs with opposing decisions lacking a supersede link, single-source-of-truth registry intact (default locale, tokens, env schema, domain types, route table each defined exactly once).

### Phase 9 — Release

SemVer tag; `CHANGELOG.md` from the ADR set + Conventional Commits; attach SBOM + `.proto-forge/snapshot.json` as artifacts. A `blocked` run (exhausted remediation, §gate-failure) is **never** tagged.

## Gate-failure protocol

1. **Remediable gates** (coverage, lint, i18n keys, testid): up to **2** targeted fix passes, each logged to `.prompts/` first. A pass may only *add* tests/keys/testids or fix the flagged line — never lower a threshold or delete an assertion.
2. **Hard-stop gates** (secrets, high/critical audit, contradiction): no auto-remediation. Stop, emit a `proposed` ADR describing the finding, surface to the operator.
3. **Exhaustion** ⇒ phase halts; run ends `blocked` in the snapshot (`gates[].result = "blocked"`), naming the failing gate + last prompt-log entry. No release tag.
4. A gate guarding a per-ADR commit runs **before** the commit is finalized; the ADR flips to `accepted` only when its commit's gates are green.

## ADR system & git workflow

- ADRs live in `docs/adr/NNN-kebab-title.md` (MADR template in `references/adr-template.md`). Lifecycle `proposed → accepted` (or `→ superseded by ADR-MMM`). Never delete; reversal = supersede.
- **Number ranges** (allocate by facet order, not as-encountered — this is load-bearing for BR-14):
  | Range | For |
  |---|---|
  | 001-009 | Foundational (stack, prompt-log, tests, i18n, security posture) — fixed at scaffold |
  | 010-019 | Domain model (one per entity, facet order) |
  | 020-029 | Component library + providers + persistence/api adapters |
  | 030-039, 050-099 | Features (one per flow, facet order — **skip the 040-049 auth band**) |
  | 040-049 | Auth model + adapter (T8), only when auth/roles are in the brief |
  | 100-199 | Security design choices |
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
- **Append-only:** existing files immutable (CI diff check). Corrections = new entries referencing the prior `id`.
- **Precedence:** prompt written **before** the resulting code/ADR is committed.
- **Linkage:** every `accepted` ADR references ≥1 prompt-log entry; every ADR-producing entry names its ADR.
- **Redaction:** before writing an entry, replace secret-shaped values (tokens/keys/connection strings/bearer creds) with `«redacted:<type>»`; PII with `«redacted:pii»` unless the brief marks it non-sensitive fixture data. `.prompts/**` is scanned by `secret-scan` like `src/**`.

## Gate commands (all in `template/package.json`)

`verify` runs all, fail-fast:
`lint` · `typecheck` · `test:unit` · `test:e2e` · `i18n:verify` · `adr:lint` · `prompt:lint` · `dup:scan` · `consistency` · `sec:scan` · `snapshot:diff`.

## Fixture vs mock — the exact line (BR-12)

Real (allowed): a Dexie store that genuinely persists/queries/enforces schema; a one-time typed **seed dataset** in `src/infra/**/seed.ts`; a zod-validated typed API client; fixtures under `**/__fixtures__/` imported **only** by `*.test.*`/`*.e2e.*`.
Banned: hardcoded literals ignoring arguments; inline `return [{id:1,...}]` in a component/hook; `vi.mock`/`jest.mock` of first-party paths; `__fixtures__` imports in production `src/`; `throw new Error("not implemented")`; lorem/`TODO`/`FIXME`.

## Reference files

- `references/facets.schema.ts` — the canonical brief schema (Phase 0 target).
- `references/decision-table.md` — T1-T13 when→then + escalation + ADR ranges.
- `references/adr-template.md` — the MADR ADR skeleton.
- `template/` — the fixed skeleton copied per run. Read `template/README.md` for its layout.

## Full requirements

The process mechanics — phase order, the copy-first rule, the full demo-deletion set, ADR-band allocation (incl. the auth-band skip), prompt-log numbering, snapshot cadence, and target-directory naming — are defined **here and in `references/decision-table.md`**. Do not defer them elsewhere; they are deterministic and belong in the skill. Only genuine *domain-requirement* ambiguity (what the product should do) escalates per the escalation rule.

This skill implements BRS-PROTO-FORGE-001 v1.1.0; P0 scope + deliberate trims are recorded in `~/work/docs/superpowers/specs/2026-07-05-proto-forge-design.md`.
