# When→Then Decision Table (the deterministic core, BRS §11)

Map normalized brief facets to fixed actions. Exhaustive for the supported surface; anything uncovered triggers the **escalation rule**, not improvisation.

| #   | WHEN (facet)                | THEN (fixed action)                                                                                          | Emits                                                       |
| --- | --------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| T1  | Brief received              | Copy `templates/web/` into the target dir (slug of first entity, else `app`); normalize into facets; write brief to `.prompts/0002-brief.md` (0001 is the shipped scaffold record); leave the shipped snapshot (regen at end of Phase 1). | — |
| T2  | Always (Phase 1)            | Scaffold pinned template: Vite+React+TS, ESLint/Prettier, Vitest, Playwright, i18next, Dexie, zod, Husky.   | ADR 001 stack, 002 prompt-log, 003 test strategy, 004 i18n |
| T3  | ≥1 domain entity            | Typed domain model + `zod` schema + repository port per entity (TS type via `z.infer`).                     | ADR 010-019 (per entity, facet order)                      |
| T4  | Always (Phase 3)            | Vendor `@jj/proto-ui` at pinned version; mount `ProtoUIProvider` once. Never hand-roll an overlay — compose Dialog/Menu/ToastProvider/Tooltip, which are promoted into the browser's top layer and ordered by when they opened. | ADR 020 own library, 008 layering (pre-written) |
| T5  | persistence = `local`       | Real Dexie/IndexedDB adapter implementing the repository port. **No mock.**                                 | ADR 022 persistence adapter                                |
| T6  | persistence = `api`         | Typed client from contract + real local adapter behind the same port; zod-validate responses. Add MSW as the test seam: handlers mirror the contract, tests run against `setupServer` — the network boundary is the only legitimate stub point (BR-12 still bans first-party mocks). | ADR 023 API port                                           |
| T7  | Per user-facing flow        | Build from library components; unique `data-testid` on every interactive + semantic element (interpolated inside `.map()`); every string a `t()` key incl. props; unit + E2E; feature doc + screenshot; per-feature DoD. | ADR 030-099 (one per flow, facet order)                    |
| T8  | auth/roles mentioned        | `auth` port + real local impl + route guards; authz E2E.                                                    | ADR 040-049 auth model                                     |
| T9  | Always (Phase 5)            | Actually translate every locale in `locales[]` — adding the file is not the task. Regenerate pseudo; axe audit. A value identical to the default locale fails unless recorded in `src/i18n/identical-ok.json` with a reason. | gate only, ADR 009 (pre-written) |
| T10 | Always (Phase 6)            | Enforce coverage gate; generate missing tests until thresholds met.                                         | gate only                                                  |
| T11 | Always (Phase 7)            | Apply security controls (BRS §4); run scans.                                                                 | ADR 100-199 if a control needs a design choice             |
| T12 | Always (Phase 8)            | Harness case + `docs:shots` + `docs:verify` for every component and feature; then dedup + contradiction sweep. | gate only                                                  |
| T13 | Always (Phase 9)            | SemVer tag, changelog, SBOM, snapshot.                                                                       | —                                                          |
| T14 | `backend` facet present     | Target(s) per `references/templates.json`, composed as ONE WORKSPACE: a `<project>/` directory scaffolded from `templates/workspace/` (its own small git repo carrying `workspace.json`, the shared brief record and orchestration scripts — it gitignores the part dirs), containing each part as a SEPARATE git repository: `api/` from `api-<stack>` first (the contract must exist before its consumers, BR-22), then `web/` from `templates/web/` when the brief names a UI, then `e2e/` from `templates/e2e/` whenever ≥2 parts exist. Every part's facets.json records the shared `pairedBrief` hash; `workspace.json` lists the parts and is their single source. | — |
| T15 | backend: X ≥ 3 ∨ messaging = broker | Architecture = **hexagonal** (ports-and-adapters, strict profile) — many external systems make adapter isolation the point. Write `.proto-forge/architecture.json` `{style, inputs}`; `arch:verify` re-derives and fails on disagreement. X = externalSystems count. | ADR 005 (pre-written, filled with the derivation) |
| T16 | backend: else C ≥ 2 ∨ E ≥ 8 | Architecture = **modular monolith** (DDD): one module per connected component of the entity reference graph, facet order. Splitting a component further is off-table ⇒ escalation. C = graph components, E = entity count. | ADR 005 |
| T17 | backend: else               | Architecture = **layered** (transaction-script; controllers → services → repositories). Hexagonal ceremony is REJECTED here — this row is its complement. | ADR 005 |
| T18 | Per entity (backend)        | Domain model + schema in the domain layer; repository port; append-only migration (BR-24). TS: zod + `z.infer`; Java: JPA entity + validation; Python: Pydantic + SQLAlchemy. | ADR 010-019 (per entity, facet order) |
| T19 | Per external system (backend) | One outbound adapter behind a port; local record under `docs/external/` with provenance (BR-18); the external contract recorded when the brief gives one. | ADR 020-029 (after persistence, facet order) |
| T20 | Always (backend Phase 3)    | Generate `contract/openapi.json` from code, normalize, commit + lock (BR-22). Every operation carries a stable deterministic `operationId` (BR-25); every error a registered problem type (BR-23). | ADR 008 (pre-written) |
| T21 | backend: authModel ≠ none   | AuthN skeleton per model (apiKey header / jwt resource-server / oidc) + authz on every route + authz tests. | ADR 040-049 |
| T22 | Brief names an off-table value (2nd persistence engine, unnamed or 2nd stack, a style contradicting T15-T17…) | Escalation rule, unchanged — never a silent override. | — |

## Escalation rule (guard against improvisation, BRS §11.1)

If a facet is **not** covered by T1-T22:

1. Write the ambiguity to `.prompts/` as an open question.
2. Emit a `proposed` ADR describing the options.
3. Pick the **most conservative, most standard** option, recording *why* in that ADR.

The "conservative default" is itself a fixed rule, so off-table behavior stays repeatable.

**A gate waiver is never the conservative default.** Relaxing a mandatory gate (i18n, testid, layer, docs, security, stub, consistency, snapshot, overlay, coverage, ignores, mutation, external — `MANDATORY_GATES` in `templates/web/scripts/config.mjs`) is an operator's product decision and needs an ADR plus an expiry date — see the gate-failure protocol in `SKILL.md`. Escalation produces a question, not a waiver.

## ADR number ranges (BRS §9.6)

Allocate **by facet order**, not sequentially-as-encountered.

`adr-lint` verifies anchors, statuses and prompt-log links; it does **not** verify bands, because a band maps to a *kind* of decision and an ADR file does not declare its kind (see `references/requirements.md` §19.6). Band allocation is a rule of the pipeline, verified in review.

| Range            | Reserved for                                                     | Assigned          |
| ---------------- | ---------------------------------------------------------------- | ----------------- |
| 001-009          | Foundational — stack, prompt-log, tests, i18n, routing, error boundary, budget, overlay layering, mandatory gates. **All nine pre-written.** | scaffold, fixed |
| 010-019          | Domain model (one per entity, facet order)                       | Phase 2           |
| 020-029          | Component library + providers + persistence/api adapters         | Phase 3 / T5-T6   |
| 030-039, 050-099 | Features (one per flow, facet order — skip the 040-049 auth band)| Phase 4           |
| 040-049          | Auth model + adapter (T8), only when auth/roles are in the brief | Phase 4 / T8      |
| 100-199          | Security design choices (CSP exceptions, SafeHtml, etc.)         | Phase 7           |
| 200-209          | Delivery & environments — container/Helm baseline, promotion, pipeline security. **Pre-written 200-202** (land with the delivery surface). | scaffold, fixed |
| 210+             | Post-v1 / supersedes / cross-cutting                             | as needed         |

The template's demo ADRs 010/022/030 are deleted with the demo in Phase 1, so real allocation starts fresh at the low end of each band.
