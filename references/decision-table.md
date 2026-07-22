# When→Then Decision Table (the deterministic core, BRS §11)

Map normalized brief facets to fixed actions. Exhaustive for the supported surface; anything uncovered triggers the **escalation rule**, not improvisation.

| #   | WHEN (facet)                | THEN (fixed action)                                                                                          | Emits                                                       |
| --- | --------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| T1  | Brief received              | Copy `template/` into the target dir (slug of first entity, else `app`); normalize into facets; write brief to `.prompts/0002-brief.md` (0001 is the shipped scaffold record); leave the shipped snapshot (regen at end of Phase 1). | — |
| T2  | Always (Phase 1)            | Scaffold pinned template: Vite+React+TS, ESLint/Prettier, Vitest, Playwright, i18next, Dexie, zod, Husky.   | ADR 001 stack, 002 prompt-log, 003 test strategy, 004 i18n |
| T3  | ≥1 domain entity            | Typed domain model + `zod` schema + repository port per entity (TS type via `z.infer`).                     | ADR 010-019 (per entity, facet order)                      |
| T4  | Always (Phase 3)            | Vendor `@jj/proto-ui` at pinned version; wire tokens + provider selector (`own` \| `radix`).                | ADR 020 own library, 021 provider fallback                 |
| T5  | persistence = `local`       | Real Dexie/IndexedDB adapter implementing the repository port. **No mock.**                                 | ADR 022 persistence adapter                                |
| T6  | persistence = `api`         | Typed client from contract + real local adapter behind the same port; zod-validate responses.               | ADR 023 API port                                           |
| T7  | Per user-facing flow        | Build feature from library components; add `data-testid`; externalize strings; unit + E2E; per-feature DoD. | ADR 030-099 (one per flow, facet order)                    |
| T8  | auth/roles mentioned        | `auth` port + real local impl + route guards; authz E2E.                                                    | ADR 040-049 auth model                                     |
| T9  | Always (Phase 5)            | i18n externalization + pseudo-locale + axe audit.                                                           | gate only                                                  |
| T10 | Always (Phase 6)            | Enforce coverage gate; generate missing tests until thresholds met.                                         | gate only                                                  |
| T11 | Always (Phase 7)            | Apply security controls (BRS §4); run scans.                                                                 | ADR 100-199 if a control needs a design choice             |
| T12 | Always (Phase 8)            | Dedup + contradiction sweep.                                                                                 | gate only                                                  |
| T13 | Always (Phase 9)            | SemVer tag, changelog, SBOM, snapshot.                                                                       | —                                                          |

## Escalation rule (guard against improvisation, BRS §11.1)

If a facet is **not** covered by T1-T13:

1. Write the ambiguity to `.prompts/` as an open question.
2. Emit a `proposed` ADR describing the options.
3. Pick the **most conservative, most standard** option, recording *why* in that ADR.

The "conservative default" is itself a fixed rule, so off-table behavior stays repeatable.

## ADR number ranges (BRS §9.6)

Allocate **by facet order**, not sequentially-as-encountered. `adr-lint` fails any ADR outside its phase's range.

| Range            | Reserved for                                                     | Assigned          |
| ---------------- | ---------------------------------------------------------------- | ----------------- |
| 001-009          | Foundational (stack, prompt-log, tests, i18n, security posture)  | scaffold, fixed   |
| 010-019          | Domain model (one per entity, facet order)                       | Phase 2           |
| 020-029          | Component library + providers + persistence/api adapters         | Phase 3 / T5-T6   |
| 030-039, 050-099 | Features (one per flow, facet order — skip the 040-049 auth band)| Phase 4           |
| 040-049          | Auth model + adapter (T8), only when auth/roles are in the brief | Phase 4 / T8      |
| 100-199          | Security design choices (CSP exceptions, SafeHtml, etc.)         | Phase 7           |
| 200+             | Post-v1 / supersedes / cross-cutting                             | as needed         |

The template's demo ADRs 010/022/030 are deleted with the demo in Phase 1, so real allocation starts fresh at the low end of each band.
