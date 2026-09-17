---
name: proto-forge
description: "Use when the user wants to scaffold or build a new app prototype, MVP, service/API, desktop application, or first shippable product slice from a short brief — triggers on /proto-forge, \"forge a prototype\", \"scaffold an app\", \"build me a prototype/MVP\", \"scaffold a service/API/backend\", \"build a desktop app\". Turns a product brief (optionally with a discovery gap-analysis) into production-grade code with zero placeholders: a React 19 + TypeScript + Vite frontend, a backend service in Node (Fastify), Java (Spring Boot), Kotlin (Ktor), Python (FastAPI) or C# (ASP.NET Core) with an architecture DERIVED from the brief's complexity (layered / modular monolith / hexagonal), a Tauri or Electron desktop shell over that frontend, or several of them composed as one workspace of separate repositories with an OpenAPI contract and a cross-app Playwright e2e layer. Every template ships 100% unit coverage behind a mutation-testing gate, a strict security + delivery baseline (environments local→dev→sit→uat→test→prod, non-root digest-pinned containers, Helm for OpenShift/AKS), per-ADR commits, an append-only prompt log and a `pnpm verify` gate suite. Deterministic: the same normalized brief yields the same structure."
---

# proto-forge

Turn a short product brief into a **first shippable product slice** — it compiles, passes its own tests, and passes its template's full gate suite (security + delivery everywhere; a11y + i18n + layering on the web; architecture + contract + migrations on a service). Not a throwaway.

**Governing rule (determinism).** Every generative decision traces to either (a) a fixed rule in this file / `references/decision-table.md`, or (b) a recorded `.prompts/` entry. You fill *domain content inside a fixed skeleton*; you never reinvent the skeleton, file layout, test structure, or ADR numbering. The guarantee is **structural** determinism (same facets → same file tree / ADR set / components), not identical prose.

## When to use

User wants a new prototype / MVP / app, service or desktop-app scaffold from a description. Targets come from `references/templates.json`: a web app (React 19 + TS + Vite), a backend service (`api-node` Fastify / `api-java` Spring Boot / `api-kotlin` Ktor / `api-python` FastAPI / `api-dotnet` ASP.NET Core — the stack comes from the brief, never a default), a desktop shell over that web UI (`desktop-tauri` / `desktop-electron`, T24), or several composed as **one workspace** of separate repositories with a cross-app e2e layer (T14). Not for: native mobile, or modifying an existing app.

## Inputs you need

A product brief (1 paragraph is enough), optionally alongside a `discovery/discovery.json` bridge from the discovery skill. If the brief is missing entities, flows, roles, persistence intent — or asks for a service without naming the stack — do **not** guess — apply the escalation rule (Phase 0 / T-escalation).

## The pipeline — run phases in order, each gated

A phase does not start until the previous phase's gate is green. Every phase writes its prompt(s) to `.prompts/` **before** acting. Every ADR that reaches `accepted` becomes its own commit.

```
Phase 0  BRIEF INTAKE      → normalized facets + prompt-log seed
Phase 1  SCAFFOLD          → fixed repo skeleton (ADR 001-004)
Phase 2  DOMAIN MODEL      → typed domain + zod schemas (ADR 010-019)
Phase 3  COMPONENT LIBRARY → seed @jj/proto-ui, one owned implementation (ADR 020)
Phase 4  FEATURE BUILD     → features from library (ADR 030-099, loop)
Phase 5  I18N + A11Y PASS  → translate every locale + pseudo + axe (gate)
Phase 6  TEST BUILD        → unit + component + E2E (gate)
Phase 7  SECURITY HARDEN   → baseline controls + scans (ADR 100-199)
Phase 8  DOCS + SWEEP      → component catalogue, screenshots, dedup (gate)
Phase 9  RELEASE           → SemVer tag + changelog + SBOM + snapshot
```

**The phase numbers and gate discipline hold for every target; only per-phase content
branches by template kind.** For a backend part (`api-<stack>`), read the phases as:
1 scaffold cleanup + `architecture.json` written from the derivation (T15–T17);
2 domain layer per the active profile (T18, ADR 010-019); 3 contract generation +
persistence adapter + append-only migrations + one adapter per external system
(T19–T20, ADR 020-029); 4 endpoint/use-case build per flow with the backend DoD —
registry-only paths, a deterministic `operationId` (BR-25), registered problem types
(BR-23), contract regenerated + re-locked in the same commit (BR-22), **every
collection paginated with the envelope shape** (NFR-29), unit +
conformance tests, a captured docs example (BR-26) **served with the contract by the
platform's `/docs` explorer where the stack ships it** (BR-47), the `@adr` anchor —
ADR 030-099, auth per T21; 5 error-catalogue + observability pass (`error:catalog`, `log:scan`)
instead of i18n/a11y; 6 test build (coverage 100 on the gated set, mutation per
NFR-14, conformance); 7 security harden (§16); 8 `docs:examples` + `docs:verify` +
dup/consistency sweep; 9 release — plus publishing `contract/openapi.json` and
cutting `contract/released/` as the breaking-change baseline. The workspace and e2e
parts run their own short chains (`ws:verify`; `registry:verify` + the static suite)
and the e2e-against-the-pair run belongs to the workspace CI (T23, BR-35).

### Phase 0 — Brief intake (the only interpretive step)

1. **Derive the target(s) (T14, T24).** No `backend` facet ⇒ one repo from `templates/web/` — or from `templates/desktop-<shell>/` when the brief asks for a desktop/standalone application (T24; the brief names the shell or it escalates with the conservative default `tauri`) — named by the kebab-slug of the first entity (or `app`). A `backend` facet ⇒ ONE WORKSPACE: scaffold `<project>/` from `templates/workspace/` (its own git repo; write the brief hash as `pairedBrief` into `workspace.json`, rewrite `parts[]` and the `.gitignore` part-dir block together, manifest order = generation order), then generate each part as a SEPARATE git repository inside it: `api/` from `templates/api-<stack>/` FIRST (its contract must exist before its consumers, BR-22), the UI part when the brief names one — `web/` from `templates/web/`, or `desktop/` from `templates/desktop-<shell>/` when that UI is a desktop application — and `e2e/` from `templates/e2e/` whenever ≥2 parts exist (T23). Every part's `facets.json` records `pairedBrief`. **Copy the template byte-for-byte and work inside it** — `.prompts/` and `.proto-forge/` exist only after this copy, so the copy is the first action (per part).
2. Write the raw brief verbatim to `.prompts/0002-brief.md` (id `0002`; the shipped `0001-scaffold.md` is the scaffold record — never reuse id `0001`) **before** generating any code.
3. **Discovery ingest (only when present).** If `discovery/discovery.json` (or `docs/discovery/discovery.json`) sits next to the brief — the discovery skill's bridge — record its `discoveryHash` in `.prompts/0003-discovery.md`, use its `facets` fragment as the **starting point** of the normalization in the next step (the brief wins every conflict; a conflict the brief does not settle escalates), and copy `discovery/docs/**` into the generated repo as `docs/discovery/**`. The facet hash and BR-14 are untouched — discovery provenance lives in the prompt log, never in the brief identity.
4. Normalize into the typed facets in `references/facets.schema.ts`: `entities[]`, `flows[]`, `roles[]`, `persistence`, `apiContract?`, `locales[]`, `nonFunctional`.
   - Entity names → PascalCase; fields → camelCase. **No synonym invention.** No flow verb the brief didn't state.
   - `persistence`: an OpenAPI/endpoint reference ⇒ `api`; "save/store/persist" without a service ⇒ `local`; neither ⇒ `none`.
   - `locales`: every locale named in the brief. **Each one is a commitment to translate**, not to add a file — see Phase 5. If the brief names none, `locales` is `["en"]` (the schema default — the facets hash is the brief identity, so never write anything else for the same brief). `pseudo` is a **generated** catalogue: it ships in `SUPPORTED_LOCALES` and is regenerated by `pnpm i18n:extract`, but it is never a `locales[]` member.
   - Missing detail ⇒ escalation (below), never a guess.
5. Write facets to `.proto-forge/facets.json`; its hash is the **brief identity** (BR-14). Two briefs with the same facets are "the same brief."
6. Leave the shipped `.proto-forge/snapshot.json` in place; it is regenerated at the end of Phase 1 (after demo cleanup) and re-staged with every ADR commit.

**Escalation rule (T-escalation).** If a facet is not covered by T1-T25: (a) write the ambiguity to `.prompts/` as an open question, (b) emit a `proposed` ADR listing the options, (c) pick the **most conservative, most standard** option and record why. Never improvise silently.

### Phase 1 — Scaffold cleanup + shell regen (always)

The template is already copied (Phase 0). Remove the self-verifying demo **in full** and regenerate the shell, so nothing about the demo `Note` entity survives into the real prototype:

- **Delete (the complete demo set):** `src/features/_example/`, `src/domain/note/`, `src/infra/persistence/` (db, noteRepository, seed + tests), `e2e/notes.e2e.ts`, `docs/features/_example/` (the whole directory, README and any screenshots), ADRs `010-note-domain.md` / `022-persistence-adapter.md` / `030-example-feature.md`, and the `example.*` keys in every `src/i18n/locales/*.json`.
- **Regenerate** (these are regeneration points, NOT part of the byte-for-byte-immutable set): `src/app/App.tsx` (drop the `_example` import + its `<Route>`; keep the shell, `BrowserRouter`, `<ErrorBoundary>`, the landmark testids and the `*` → `NotFound` route — routed content is empty until Phase 4 adds real features), `src/app/App.test.tsx` (drop the notes/db assumptions — keep the shell-landmark + not-found assertions), `src/app/routes.ts` (as the brief needs).
- **Keep (immutable):** all of `packages/proto-ui/`, `src/app/ErrorBoundary.tsx`, `src/app/NotFound.tsx`, `src/app/ErrorBoundary.test.tsx`, `e2e/shell.e2e.ts`, `e2e/overlay-layering.e2e.ts`, `e2e/component-library.e2e.ts`, `e2e/support/`, `src/harness/` (the proto-ui cases are library fixtures, not demo content), `src/shared/SafeHtml.tsx`, `src/config/`, `src/i18n/` config, `docs/components/**`, `.claude/`, `AGENTS.md`, every config + gate script, and ADRs 001–009, 020 and 100 (pre-written `accepted`).

After cleanup, run `pnpm snapshot` to regenerate `.proto-forge/snapshot.json`. Gate: `pnpm install && pnpm typecheck && pnpm build` exits 0.

### Phase 2 — Domain model (if brief names ≥1 entity, T3)

Per entity, in facet order, generate `src/domain/<entity>/{model.ts,schema.ts,repository.ts}`: TS type **derived** from the zod schema via `z.infer` (never hand-duplicated), a repository **port** (interface). One ADR per entity from range **010-019**.

### Phase 3 — Component library (always, T4/T5/T6)

The template already vendors `@jj/proto-ui` under `packages/proto-ui/` — Button, Field, Select, Checkbox, Dialog, Menu, Table, Tabs, Tooltip, ToastProvider, Portal, ProtoUIProvider (ADR 020 own library, 008 layering — pre-written). The seed is byte-pinned: `.proto-forge/seed.lock` holds its sha256 and `snapshot:diff` re-verifies it every run (BRS §17.2) — **never edit files under `packages/proto-ui/` during generation** (a Claude Code hook blocks it); a legitimate seed upgrade = ADR + `pnpm seed:lock`. Mount `ProtoUIProvider` once at the app root. Then per `persistence`:
- `local` (T5) → real Dexie/IndexedDB adapter implementing the repository port. ADR 022.
- `api` (T6) → typed client from the contract + real local adapter behind the same port; zod-validate responses. **MSW is the test seam for the `api` facet**: request handlers mirror the contract, unit/component tests run against `setupServer`, and no first-party module is ever mocked — the network boundary is the only legitimate stub point. MSW is added *by this facet*, never pre-installed — an unused package is dead weight (BR-12; for runtime `dependencies` the `consistency` gate rejects it mechanically, for devDependencies the rule holds by review). ADR 023.

Seed data (if needed) lives **only** in `src/infra/**/seed.ts`, typed against the domain schema. Never inline literals in components/hooks.

**Never hand-roll an overlay.** Compose `Dialog`, `Menu`, `ToastProvider` and `Tooltip`. They are promoted into the browser's top layer, ordered by when they opened, and portal to a body-level root for the no-top-layer fallback; `layer:scan` rejects a fixed-position surface that skips the portal, a second `document` keydown listener, a direct `showPopover` call and a numeric z-index, and `component-dup-scan` rejects a raw element wearing a primitive role.

### Phase 4 — Feature build (per flow, T7 — loop)

For each `flows[]` entry, in order, allocate one ADR from **030-099** and build the feature. **Per-feature Definition of Done** (assert ALL before flipping the ADR to `accepted`):

- [ ] **Every rendered control performs its real action, end to end** (BR-44). No dead-end interactions: no "not available in the prototype" copy, no no-op handler, no `href="#"`. When the flow implies CRUD on a persisted entity, ALL of create/read/update/delete ship in this ADR — screens, actions, tests and docs; a capability cut from scope does not render a control, and the cut itself is an ADR, never UI copy. Out of budget ⇒ escalate, never stub.
- [ ] Built solely from `@jj/proto-ui` components (no duplicated primitive, no hand-rolled overlay).
- [ ] Every interactive and semantic element has a `data-testid` — interactive controls, headings, landmarks, list items, table cells, media, form parts, anything with a `role`. Namespaced by feature (`invoices-submit`, not `submit`), and **interpolated inside a `.map()`** (`` `invoice-${id}` ``).
- [ ] Elements a discovery run inventoried (Phase 0 step 3) use their **reserved** `data-testid` allocations from `discovery.json` `testids[]` verbatim; new elements derive fresh names around the reservations (BR-31).
- [ ] Any page the feature adds is a `<Route>` whose path comes from `src/app/routes.ts` (never a literal), reachable by deep link.
- [ ] Every user-visible string is a `t('...')` key — as JSX text **and** as a prop (`title`, `label`, `emptyLabel`, `errorMessage`, …) — present in the default locale and translated in every other one.
- [ ] Unit/component tests meet the feature-layer coverage floor (§3.1 of BRS).
- [ ] ≥1 Playwright E2E covering the happy path **and** primary error path, against real behavior.
- [ ] `axe` 0 serious/critical on the feature's pages; keyboard path verified in E2E.
- [ ] Inputs zod-validated at the boundary; no unvalidated external data enters the domain.
- [ ] `docs/features/<name>/README.md` written — API, testid map, i18n keys, a11y contract, VoiceOver smoke note — with a current screenshot. A feature that adds a route ALWAYS shows its current visual state; `<!-- no-screenshot: reason -->` is only for genuinely non-visual subjects (BR-19).
- [ ] ADR anchored in code via `// @adr NNN - ...`; prompt-log entry referenced.
- [ ] The feature's commit passed the fast lane (`pnpm verify:fast`, BR-45) before its ADR flipped to `accepted`.

After the accepted-ADR commit, run `pnpm sync:auto`: with `autoPropagate: true` committed in the config it propagates the decision to JIRA/Confluence right away; otherwise it stages the payloads in `.proto-forge/outbox/` and prints why nothing was sent.

If auth/roles are mentioned (T8): add `auth` port + real local impl + route guards + authz E2E. ADR from 040-049.

**Settings are durable (BR-48).** A settings/preferences surface persists through the repository port like any entity — values survive a rebuild and a redeploy; never direct `localStorage`/`sessionStorage`. The settings schema keeps its identity across releases; changing or resetting it is an ADR with a migration, never a side effect of a new build.

### Phase 5 — i18n + a11y pass (gate)

**Every locale in `locales[]` gets a real translation.** Adding `cs.json` with English values is the failure this gate exists to catch: `pnpm i18n:verify` fails on a missing key, an empty or placeholder value, a dropped `{{placeholder}}`, a plural form the language requires but the catalogue lacks, a catalogue nobody imports, a key no code uses, a computed `` t(`x.${y}`) `` without a declared key set, and on any value byte-identical to the default locale. If a value genuinely cannot differ — a product name, an acronym — record it in `src/i18n/identical-ok.json` with a reason; stale entries fail too.

Add each locale to `SUPPORTED_LOCALES` in `src/i18n/config.ts` **and** import it in `src/i18n/index.ts`. Regenerate `pseudo.json` with `pnpm i18n:extract`. Then run the axe integration in E2E. a11y strings (labels, `aria-live` messages) are i18n keys, never inline literals — enforced by lint across `src/**` and `packages/proto-ui/**`.

### Phase 6 — Test build (gate)

`pnpm test:unit` (100/100/100/100 on every glob; `coverage:policy` locks the thresholds and the exclusion list, `ignores` pins the `v8 ignore` population) + `pnpm test:mutation` (Stryker, break 90 on the behavioural core) + `pnpm test:e2e` (including the suite **generated** from `src/harness/cases.ts` — adding a case adds its browser tests). Generate missing tests until every gate is green. Tests assert **behavior** (Testing Library role/testid queries), never implementation details, never `vi.mock` of first-party modules; fixture data comes from `defineFactory` in `src/test/factory.ts`, parsed through the domain schema. `src/test/setup.ts` asserts testid uniqueness in the rendered DOM after every test — a failure there means two elements share a name, not that the test is wrong.

### Phase 7 — Security harden (gate, T11)

Apply the BRS §4 baseline (already wired in the template): strict CSP, zod boundary validation, `SafeHtml` as the only sanitized-HTML entry point, no secrets, `pnpm audit` gate, security headers documented in `SECURITY.md`. Any control needing a design choice → ADR from **100-199**. Security scans (`gitleaks`, high/critical `audit`) **hard-stop** — never auto-suppress.

### Phase 8 — Documentation + consistency sweep (gate)

Add a case to `src/harness/cases.ts` and its mount to `src/harness/mounts.tsx` for every state worth showing, run `pnpm docs:shots`, then `pnpm docs:verify`: every exported component and every feature has a page, each page shows a screenshot that was taken from the **current** source, and no page is a stub. Editing a component invalidates its screenshots until `docs:shots` runs again.

Then `pnpm dup:scan` + `pnpm consistency`: no code clones >30 tokens (except library primitives), no local re-impl of a proto-ui primitive, no duplicate i18n values, no two `accepted` ADRs with opposing decisions lacking a supersede link, single-source-of-truth registry intact (default locale, tokens, env schema, domain types, route table each defined exactly once).

### Phase 9 — Release

SemVer tag; `CHANGELOG.md` from the ADR set + Conventional Commits; attach SBOM + `.proto-forge/snapshot.json` as artifacts. A `blocked` run (exhausted remediation, §gate-failure) is **never** tagged. Then run `pnpm sync:auto`: with `autoPropagate: true` committed in the config it propagates live — that committed flag IS the operator's standing consent. Otherwise payloads stay staged in `.proto-forge/outbox/` for review; **never type `--approve` yourself**, the per-run approval is the operator's to give.

## Configuration, waivers and guardrails

`.proto-forge/config.json` (merged over built-in strict defaults and `~/.config/proto-forge/config.json`) controls gate modes, integrations and guardrails. `pnpm config:show` prints what is in force; `pnpm config:check` runs first in `verify`.

**Tightening is free. Relaxing a mandatory gate is not.** The 17 mandatory gates — i18n, testid, layer, docs, security, stub, consistency, snapshot, overlay, coverage, ignores, mutation, external, env, deploy, client and status (`MANDATORY_GATES` in `scripts/config.mjs`) — may drop below `error` only with a `waivers[]` entry carrying a reason, an existing ADR and an expiry date. Without a live waiver the setting is ignored and the gate runs at `error` anyway; with one, the run is stamped `conformance: "waived"`, the relaxation prints on every verify, and it expires by itself. **Never propose a waiver as a way to make a red gate green** — it is for a recorded product decision (a single-locale pilot), and it needs the operator's agreement, not yours.

`.claude/settings.json` wires local hooks: they block edits to the byte-pinned seed and the append-only prompt log, block lowering a coverage threshold / budget ceiling / gate mode, block `--no-verify` and unlisted network hosts, run the structural scans after every TS edit, and sweep before the turn ends. `AGENTS.md` states the same rules in prose for CLIs that have no hook mechanism.

**Integrations are off by default and dry-run first.** With `integrations.jira.enabled` or `integrations.confluence.enabled` on, `pnpm sync:jira` / `pnpm sync:confluence` stage payloads into `.proto-forge/outbox/` and contact nothing. Live writes need `dryRun: false`, an open network guardrail with the host allowlisted, `--commit --approve`, and credentials from the env vars the config names. **No pipeline phase ever calls out unless `autoPropagate: true` is committed in the config** — a standing, reviewed consent that stands in for the per-run `--approve` and for nothing else (enabled, `dryRun: false`, the allowlist and credentials still apply). With it on, `pnpm sync:auto` — run after each accepted-ADR commit and at release — propagates live; with it off, generating a prototype never files tickets or overwrites pages as a side effect.

## Gate-failure protocol

1. **Remediable gates** (coverage, lint, i18n keys, testid, docs/screenshots, budget): up to **2** targeted fix passes, each logged to `.prompts/` first. A pass may only *add* tests/translations/testids/docs or fix the flagged line — never lower a threshold, delete an assertion, add an `identical-ok` entry for a string that simply was not translated, or waive a gate.
2. **Hard-stop gates** (secrets, high/critical audit, contradiction): no auto-remediation. Stop, emit a `proposed` ADR describing the finding, surface to the operator.
3. **Exhaustion** ⇒ phase halts; run ends `blocked` in the snapshot (`gates[].result = "blocked"`), naming the failing gate + last prompt-log entry. No release tag.
4. A gate guarding a per-ADR commit runs **before** the commit is finalized; the ADR flips to `accepted` only when its commit's gates are green.

## Defect protocol (BR-49)

The moment a defect becomes **known** — a red gate that resists the remediation protocol, a bug found in review or testing, an operator report:

1. **Record it immediately.** With a GitHub remote: `gh issue create` — title, reproduction, the failing gate/test (in a workspace, file on the workspace repo). Without a tracker: a `proposed` ADR records it. A defect that lives only in the session is a defect the next session re-diagnoses from scratch.
2. **Fix it as a `fix:` commit that carries its regression test in the same diff** — a test that fails before the fix and passes after. Reference the issue as `Fixes #N` in the body. `commit-lint` mechanically refuses a `fix:` commit that stages no test file.
3. **Never mask it** — not behind copy, a disabled control (BR-44), a waiver, or a lowered floor.

## ADR system & git workflow

- ADRs live in `docs/adr/NNN-kebab-title.md` (MADR template in `references/adr-template.md`). Lifecycle `proposed → accepted` (or `→ superseded by ADR-MMM`). Never delete; reversal = supersede.
- **Number ranges** (allocate by facet order, not as-encountered — this is load-bearing for BR-14):
  | Range | For |
  |---|---|
  | 001-009 | Foundational (stack, prompt-log, tests, i18n, routing, error boundary, performance budget, overlay layering, mandatory gates) — fixed at scaffold, **001-009 pre-written** `accepted` |
  | 010-019 | Domain model (one per entity, facet order) |
  | 020-029 | Component library + providers + persistence/api adapters — **020 pre-written** `accepted` (own library); 021 is retired, the number stays unused |
  | 030-039, 050-099 | Features (one per flow, facet order — **skip the 040-049 auth band**) |
  | 040-049 | Auth model + adapter (T8), only when auth/roles are in the brief |
  | 100-199 | Security design choices, budget changes, gate waivers — **100 pre-written** `accepted` (sanitized HTML); the first generated security ADR is **101** |
  | 200+ | Post-v1 / supersedes / cross-cutting |

  The template's demo ADRs 010/022/030 are **deleted with the demo** in Phase 1, so real allocation starts fresh at the low end of each band (entity #1 → 010, first persistence adapter → 022, first feature → 030). The pre-written 020 and 100 **stay** — allocate around them (`adr:lint` errors when two files share a number). Auth (model + adapter) lives only in 040-049; the feature loop skips that band.
- **In-code anchor:** exactly `// @adr 123 - implementation of <thing>`. Referenced ADR must exist and be `accepted`; every `accepted` ADR anchored ≥1×.
- **One accepted ADR = one commit**, containing the ADR transition + its code + tests + docs. **Authorship (BR-46): the git author is the operator who ran the prompt — never the model; the model that prepared the commit signs as co-author.** Message:
  ```
  feat(scope): <imperative summary>

  Implements the decision in ADR NNN.

  ADR: NNN
  Prompt-Log: .prompts/NNNN-slug.md
  ```
  **Do not type the `Co-Authored-By:` trailer.** The `prepare-commit-msg` hook derives it (`scripts/commit-coauthor.mjs`): it reads the `model:` field of the prompt-log entry the `Prompt-Log:` trailer names, resolves it in `.proto-forge/models.json`, and appends that model's registered identity — falling back to `PROTO_FORGE_MODEL` and then to `.proto-forge/session.json` (written by the `SessionStart` / `PostModelSwitch` hooks) when the message names no entry yet. `commit-lint` then verifies exactly one `ADR:` trailer, one status transition to `accepted` in the diff, a resolving `Prompt-Log:` trailer, ≥1 well-formed `Co-Authored-By:` trailer whose identity is not the git author's, and that the trailer signs as the model the cited entry records. A commit whose model cannot be resolved does not happen — record the model in the entry first.
- **Commit atomicity:** stage with ADR still `proposed` → regenerate + stage `.proto-forge/snapshot.json` (`pnpm snapshot`) so `snapshot:diff` compares against the snapshot committed in this same commit → run the **fast lane** (`pnpm verify:fast`) → only if green, flip to `accepted` and finalize. Red ⇒ ADR stays `proposed`, no commit, gate-failure protocol takes over. An `accepted` ADR in history always corresponds to a commit whose fast-lane gates passed — and the full `pnpm verify` holds the line at its three checkpoints: end of Phase 6, release, and CI on every push (BR-45).

## Model routing (BR-50)

The pipeline runs on whatever model the operator opened the session with — Anthropic's or OpenAI's, any tier. Which model runs a **delegated** activity is not a per-dispatch choice: it is read from the routing table in `.proto-forge/models.json` (the byte-identical copy of `references/models.json`, NFR-31; `references/model-routing.md` is the same table with its reasons).

- **Know your own model first.** Read `.proto-forge/session.json` (the `SessionStart` / `PostModelSwitch` hooks write it) or `PROTO_FORGE_MODEL`; that registered id is the `model:` of every prompt-log entry you write. Never guess it.
- **Route every dispatch through its pinned definition (T25, BR-51).** Every delegable activity has a subagent definition in `.claude/agents/<activity>.md` — `scaffold-cleanup`, `codebase-search`, `domain-model`, `adapter-build`, `feature-build`, `translation`, `a11y-pass`, `test-build`, `security-harden`, `documentation`, `gate-remediation`, `code-review`, `release` — whose `model` is pinned to the tier the routing table gives it. Dispatch with `subagent_type: <activity>` and **no `model` parameter**: the harness, not your memory of the table, picks the model. `brief-intake` and `decision-record` are routed to `frontier` and have no definition — the orchestrator does them.
- **The frontier rule — no override.** When the orchestrating model is `frontier` tier (GPT-6 Astra, Claude Fable, Claude Opus and their peers), every subagent runs on a strictly lower tier. An activity routed to `frontier` (`brief-intake`, `decision-record`) is one a frontier orchestrator performs itself; that is the point of the row.
- **Record before dispatch.** The delegated prompt-log entry is written *before* the agent starts, with `model: <the definition's pinned model>`, `delegated-by: <your entry's id>` and `activity: <the routed key>`. Passing a `model` override on the dispatch is the only deviation, and it records `routing-override: <reason>` — provenance, not a bypass; the frontier rule still applies above it.
- `prompt:lint` fails an entry with no model, an unregistered model, a delegated entry off its routed tier without an override, and a frontier orchestrator delegating at its own tier. Never widen the registry inside a prototype to make a dispatch pass: the copy is a protected path, and tier membership is a priced decision made in the plugin.

## Prompt log (append-only, English)

- One Markdown file per prompt in `.prompts/`, named `NNNN-slug.md` (zero-padded, monotonic), with frontmatter `id/timestamp/phase/adr/author/model` (+ `delegated-by/activity` on a delegated entry, BR-50) + `## Prompt` + `## Outcome` (1-3 lines).
- **English only (BR-13):** entries are written in English. A prompt that arrived in another language is recorded as its faithful English rendering, written as if authored in English — never add a translation note, never keep the original text. Non-English product strings the brief demands stay as backtick-quoted literals. `prompt:lint` enforces this.
- **Append-only:** existing files immutable (CI diff check + a local hook). Corrections = new entries referencing the prior `id`.
- **Precedence:** prompt written **before** the resulting code/ADR is committed.
- **Linkage:** every `accepted` ADR references ≥1 prompt-log entry; every ADR-producing entry names its ADR.
- **Redaction:** before writing an entry, replace secret-shaped values (tokens/keys/connection strings/bearer creds) with `«redacted:<type>»`; PII with `«redacted:pii»` unless the brief marks it non-sensitive fixture data. `.prompts/**` is scanned by `secret-scan` like `src/**`.

## Gate commands (per template — the web chain shown; every template's chain lives in its own `package.json`, per `references/templates.json`)

**Two lanes (BR-45).** `verify:fast` is the per-iteration bar — run it for every feature commit; it answers in minutes because the pinned gates (`FAST_GATES` in `scripts/config.mjs`) execute **in parallel** through `scripts/verify-fast.mjs` — wall clock is the slowest gate, not the sum, fail-fast on the first red. `verify` is the full bar, and its **checkpoints are exactly three**: the end of Phase 6 (the test build — where mutation and the browser suite belong), Phase 9 (release), and CI on every push. Phases 5, 7 and 8 close on the fast lane **plus their own named gates** — Phase 5 adds `test:e2e` (the axe + keyboard proof lives in the browser), Phase 7 adds `sec:scan` + `sec:conformance`, Phase 8 adds `docs:shots` before the lane's `docs:verify` — anything a lighter close could miss is held by the next full checkpoint and by CI. **Never run the full suite between two feature commits**, that is what made iterations take hours.

`verify` runs all, fail-fast:
`config:check` · `env:verify` · `gates:selftest` · `lint` · `typecheck` · `coverage:policy` · `ignores` · `test:unit` · `test:mutation` · `build` · `deploy:verify` · `budget` · `i18n:verify` · `layer:scan` · `overlay:matrix` · `testid:scan` · `docs:verify` · `external:verify` · `contract:client` · `stub:scan` · `adr:lint` · `prompt:lint` · `dup:scan` · `consistency` · `sec:scan` · `sec:conformance` · `snapshot:diff` · `test:e2e` · `quality:report` · `status:verify`.

This paragraph is checked, not remembered: `skill:gates` (plugin) fails when the count, the list or the chain above is not what `templates/web/scripts/config.mjs` and `templates/web/package.json` enforce, in that order (§17.3).

Supporting commands: `config:show` · `docs:shots` · `i18n:extract` · `snapshot` · `seed:lock` · `sync:jira` · `sync:confluence` · `sync:pull` · `sync:status` · `sync:auto`.

`gates:selftest` builds a throwaway project per failure mode and asserts every gate's exit code — run it after touching any scan script.

`budget` (ADR 007) gzips the built `dist/` assets and enforces 300 kB JS / 60 kB CSS / 250 kB per chunk, and refuses to measure a harness build. It is a **remediable** gate — trim or split, never raise the ceiling; a real budget change is an ADR from 100-199 plus the constant in `scripts/budget.mjs`.

## Fixture vs mock — the exact line (BR-12)

Real (allowed): a Dexie store that genuinely persists/queries/enforces schema; a one-time typed **seed dataset** in `src/infra/**/seed.ts`; a zod-validated typed API client; fixtures under `**/__fixtures__/` imported **only** by `*.test.*`/`*.e2e.*`; the component harness in `src/harness/**`, which is a screenshot-and-browser-test catalogue and never in a production build.
Banned: hardcoded literals ignoring arguments; inline `return [{id:1,...}]` in a component/hook; `vi.mock`/`jest.mock` of first-party paths; `__fixtures__` imports in production `src/`; `throw new Error("not implemented")`; lorem/`TODO`/`FIXME`.

## Reference files

- `references/facets.schema.ts` — the canonical brief schema (Phase 0 target).
- `references/decision-table.md` — T1-T25 when→then + escalation + ADR ranges.
- `references/models.json` — the model registry (NFR-31): every model the pipeline may run on, its tier and list price, the identity its `Co-Authored-By` trailer carries, and the routing table (BR-50). Every template ships a byte-identical copy at `.proto-forge/models.json`; `references/model-routing.md` explains each routed activity.
- `references/adr-template.md` — the MADR ADR skeleton.
- `references/templates.json` — the template registry: every target the pipeline may copy (`web`, `api-node`, `api-python`, `api-java`, `api-kotlin`, `api-dotnet`, `desktop-tauri`, `desktop-electron`, `workspace`, `e2e`), with its dir, kind and stack. Read the chosen template's own `README.md` for its layout and its `AGENTS.md` for the rules every change must satisfy.
- `references/security-controls.json` — the security control catalogue (BRS §25, BR-38): every control a generated application carries, bound to the OWASP ASVS 5.0 requirement that asks for it, with SLSA Build L3 and NIST SSDF alongside. Requirement numbers are references into the vendored, sha-pinned `references/standards/asvs-5.0.0.flat.json`, never transcriptions, and `security:catalogue` resolves each one. A control marked `planned` is an admitted gap naming its stage — read the catalogue for what the bar *is*, not for what already holds.
- `skills/discovery/` — the discovery skill whose `discovery.json` bridge Phase 0 ingests.
- `skills/survey/` — the existing-system inventory skill whose evidence can seed discovery.
- `skills/elicit/` — the stakeholder-instrument skill whose completed evidence can seed discovery.

## Full requirements

The process mechanics — phase order, the copy-first rule, the full demo-deletion set, ADR-band allocation (incl. the auth-band skip), prompt-log numbering, snapshot cadence, and target-directory naming — are defined **here and in `references/decision-table.md`**. Do not defer them elsewhere; they are deterministic and belong in the skill. Only genuine *domain-requirement* ambiguity (what the product should do) escalates per the escalation rule.

This skill implements the requirements register in `references/requirements.md` — the normative source for every `BR-xx` / `NFR-xx` / `BRS §x` citation in this repository. The design decisions behind the current seed are recorded in `docs/specs/`, and the plugin's own decision history in `docs/adr/`.
