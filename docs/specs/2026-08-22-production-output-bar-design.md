# Production output bar — closing the gaps between "gated" and "shippable"

- Date: 2026-08-22
- Register space: **§10** rules **BR-44 … BR-47**, **NFR-29 … NFR-30**; amendment to **BR-13**; plugin ADRs **015–019**
- Status: E1–E6 landed for the canonical templates named per stage; the remaining stacks are staged below

## The operator's findings

Six gaps observed in generated output, verbatim in intent:

1. **Dead-end interactions.** A run implements the screen for a flow, then wires a
   button to a toast that says the action "is not available in the prototype".
   Once an ADR accepting a CRUD flow exists, every screen and every action that
   flow implies must exist, work, be tested and be documented — a control whose
   only behaviour is to explain that the feature is missing is a placeholder
   wearing real i18n keys, and no gate caught it.
2. **Iteration latency.** The full gate suite (mutation + browser e2e + selftest
   + audit) runs inside the per-feature loop, so one iteration can take hours.
   The per-iteration bar must answer in minutes; the deep proofs belong at phase
   boundaries and release, not between two feature commits.
3. **Documentation currency.** Framework docs and generated-app docs must always
   reflect the current state. (Largely held already by BR-19/BR-36/BR-42; the
   remaining gap is frontend features whose pages use the no-screenshot escape.)
4. **Prompt log language.** Prompt-log entries are stored in English only, with
   no annotation that anything was translated.
5. **Commit authorship.** Every commit is authored by the person who ran the
   prompt, with the model that prepared the commit as co-author.
6. **Backend contract surface.** A service satisfies OpenAPI *and serves* an
   explorer with usage examples; collections are paginated; performance,
   scalability and resource use are observed in the pipeline, not assumed.
7. **Settings durability.** A settings tab is persistent between builds unless
   an ADR asks for a change.
8. **Loop hygiene.** Local tests may execute in parallel — the loop moves fast,
   with no needless idle time or stalls; and a known issue immediately becomes
   a GitHub issue, which then gets fixed with a regression test existing for it.

## Decisions (one ADR each)

### D1 — Dead-end interactions are banned (BR-44, plugin ADR 016)

`stub:scan` in the web-family templates learns two mechanical checks:

- **Dead-end copy**: a phrase from the pinned list (`not available/implemented/
  supported (in|yet)`, `coming soon`, `in a future version/release`, `this
  prototype/demo/preview`, `will be available/added/implemented`) in production
  code strings **or in any locale catalogue value** fails. Locale catalogues were
  previously outside every scan — which is exactly where the polite refusal hid.
- **No-op wiring**: an interaction handler that is a hard-coded empty function
  (`onClick={() => {}}`) or an `href="#"` fails — a control wired to nothing.

The non-mechanical half — *flow completeness*: an accepted CRUD ADR ships all of
create/read/update/delete surfaces with tests and docs — is a Phase-4 DoD item
and a review obligation; the limit is stated in the rule (BR-12 precedent).

### D2 — Two-lane verification (BR-45, plugin ADR 015)

Every app template ships **`pnpm verify:fast`** next to `pnpm verify`:

- **Fast lane** — the per-iteration, per-feature-commit bar: config, lint,
  typecheck, unit tests with coverage floors, the structural scans, docs
  freshness, provenance lints, snapshot. Target: minutes on a warm tree.
- **Full lane** — unchanged `pnpm verify`: adds gate selftests, mutation
  testing, build + budget, delivery surface, security scans and the browser/e2e
  suites. Runs at each phase boundary (end of Phases 4–8), before release, and
  in CI — never inside the feature loop.

The fast chain is **pinned** as `FAST_GATES` in each template's
`scripts/config.mjs`; `config:check` fails when `verify:fast` drifts from the
pin or names a gate the full chain does not run. "Scoped gates" in SKILL.md now
*means* the fast lane — the term stops being interpretive.

The lane executes **in parallel**: `verify:fast` invokes the byte-shared
`scripts/verify-fast.mjs`, which runs `config:check` first and alone, then the
remaining pinned gates under a machine-sized worker pool with buffered output
and a fail-fast kill — safe because every fast gate is offline and read-only
except `test:unit`, whose output nothing else in the lane reads. Wall clock
becomes the slowest gate, not the sum (finding 8's first half).

### D8 — Defect protocol (BR-49, plugin ADR 021)

A known defect is recorded the moment it is known: a GitHub issue (`gh issue
create` — repro, failing gate/test; on the workspace repo in a composition)
when a remote tracker exists, a `proposed` ADR otherwise. The fix is a `fix:`
commit carrying its regression test in the same diff and referencing the issue
(`Fixes #N`). `commit-lint` mechanically refuses a `fix:` commit whose staged
diff touches no test file; the fails-before property and the reference are
review. Filing is the operator's tooling — never a pipeline side effect
(BR-20).

### D3 — The prompt log is English (BR-13 amendment, plugin ADR 017)

Prompt-log entries are written in English. A prompt that arrived in another
language is recorded as its faithful English rendering, written as if authored
in English — no translation markers, no original-language copy. Non-English
*product strings* (a Czech UI label the brief demands) are quoted in backticks.
`prompt:lint` fails a body token carrying non-ASCII letters outside code spans;
frontmatter (author names) is exempt.

### D4 — The operator authors, the model co-authors (BR-46, plugin ADR 017)

Every commit's git author is the operator who ran the prompt; the model that
prepared the commit is named in a `Co-Authored-By: <name> <email>` trailer.
`commit-lint` requires at least one well-formed co-author trailer and — inside a
git repository — fails when the git author's email equals a co-author's (the
model may not author). That the named model *is* the generating model is prose
and review; the limit is stated.

### D5 — The contract is served, exampled and paginated (BR-47 + NFR-29, plugin ADRs 018–019)

- **Served explorer** (BR-47): the platform kernel serves `GET /openapi.json`
  (the committed contract, byte-for-byte) and `GET /docs` — an owned,
  self-contained explorer (no external assets, CSP-clean) rendering every
  operation with its schemas, problem types, the **captured** BR-26 examples and
  copy-paste curl usage. Enforced by the platform unit suite (behaviour) and a
  static half in `contract:verify` (the explorer module exists and is wired).
- **Paginated collections** (NFR-29): a GET operation returning a top-level
  array fails (an unbounded collection); a GET whose 200 embeds an array must
  declare `limit` (+ `offset` or `cursor`) query parameters. The demo `Note`
  slice is reworked to the envelope shape so generated services inherit the
  pattern.

**Staging** (the §26 doctrine — a rule lands with its enforcer, never before):

| Stage | Template | Status |
| --- | --- | --- |
| E5a | `api-node` | landed with this spec |
| E5b | `api-python` (FastAPI static routes for `/docs` + `/openapi.json` serving the committed artefacts) | next |
| E5c | `api-java`, `api-kotlin` | after E5b |
| E5d | `api-dotnet` | after E5c |

Until a stack lands, BR-47/NFR-29 `Scope:` names only the landed templates.

### D6 — Performance and resource use are pipeline stages (NFR-30, plugin ADR 019)

NFR-13 already records why micro-latency budgets are environment noise. What a
pipeline *can* hold: a **perf-smoke stage** in the shared `package.yml` that
boots the freshly built image, drives a fixed load, and enforces only coarse
ceilings — zero errors, zero non-2xx, p95 under one second, image size under a
named ceiling — while publishing the measured numbers (latency percentiles,
throughput, container memory peak, image size) to the job summary as the trend
record. The stage self-gates on `contract/openapi.json` existing, so the shared
workflow stays byte-identical across frontend and backend templates.
`deploy:verify` fails a `package.yml` that lost the stage.

### D7 — Documentation stays current (no new rule)

BR-19 gains one sentence: for a feature that adds a route, the no-screenshot
escape does not apply — a routed page always shows its current visual state.
Framework docs (README, SKILL.md) are updated in the same change-set as the
rules they describe; `citations` already fails a stale reference.

## Delivery map

| # | Change | Files (canonical → propagated) |
| --- | --- | --- |
| 1 | BR-44 scan + cases | `templates/web/scripts/stub-scan.mjs` → desktops; selftest cases ×3 |
| 2 | BR-45 lane | `package.json`, `scripts/config.mjs`, `scripts/config-cli.mjs`, selftest ×8; `references/templates.json` notAGate |
| 3 | BR-13 lint | `prompt-log-lint.mjs` (3 variants) + cases ×10 |
| 4 | BR-46 lint | `commit-lint.mjs` (9 copies) + cases ×8 |
| 5 | BR-47/NFR-29 | api-node: platform docs module + tests, note slice pagination, `contract-verify.mjs`, contract + captures regenerated, Dockerfile |
| 6 | NFR-30 | shared `package.yml` + `deploy-verify.mjs` (×6) + cases ×6 |
| 7 | Norms + docs | `references/requirements.md`, `SKILL.md`, `references/decision-table.md` (T7 note), `README.md`, `CHANGELOG.md`, plugin ADRs 015–019 |

Every template touched re-runs `gates:selftest`, re-locks its seed where
`scripts/` is seed-pinned (the api templates), and regenerates
`.proto-forge/snapshot.json`.
