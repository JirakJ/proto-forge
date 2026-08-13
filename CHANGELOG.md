# Changelog

## 0.5.0 — 2026-08-12

The 38-finding remediation + auto-propagation release. A 44-agent adversarial audit of
v0.4.0 confirmed 38 findings (docs-vs-code drift, gate blind spots, CI misconfiguration);
every one is fixed here, and each repaired gate gained the self-test case that would have
caught it. New feature: standing-consent propagation to Confluence/JIRA.

### autoPropagate — implemented work propagates when the operator said so (ADR 005 plugin, BR-20)

- `integrations.<name>.autoPropagate: true` committed in `.proto-forge/config.json` is
  standing, reviewed consent for unattended live writes. It stands in for the per-run
  `--approve` and **nothing else** — enabled, `dryRun: false`, the network allowlist and
  credentials still apply.
- New `pnpm sync:auto`: run after each accepted-ADR commit and at release; stages always,
  sends live only for integrations with all doors open, prints which door is closed
  otherwise. Defaults ship `false` — with defaults, "no pipeline phase ever calls out"
  holds verbatim.
- The semantics are register-level (new **BR-20**) and pinned by four gate self-tests
  (stands in for approve; does not bypass dry-run; does not open the network guardrail).

### Gate blind spots closed (each with its new self-test)

- **commit-lint** now checks the *diff half* of BR-06: exactly one `- Status: accepted`
  transition in the staged ADR diff, and it must be the ADR the trailer names.
- **adr:lint** errors when two files share an ADR number (was silent last-write-wins —
  exactly what a generator allocating "the low end of the band" next to the pre-written
  020/100 would trigger).
- **coverage:policy** scan anchored on the line-ending `],` — a character-class glob
  (`src/[a-z]*/**`) can no longer truncate the exclude scan and smuggle entries past the
  allow-list.
- **stub:scan** bans inline `eslint-disable` of the gated i18n/testid/layering rules in
  production code — BR-08's "no escape hatch" is now mechanical, not aspirational.
- **consistency** rejects a runtime `dependencies` entry nothing imports (found the live
  counterexample: the stale `@radix-ui` entry in the seed's manifest, now removed —
  lockfile resolves zero radix packages).
- **guard-write hook** also freezes the mutation-score floor, the `mutate[]` scope, the
  duplication threshold and its ignore list (`stryker.config.json`, `.jscpd.json`).
- **useDismiss**: one outside gesture dismisses exactly one surface, and a topmost
  tooltip no longer shields the menu below it; the pure ordering (`newestFirst`) is
  exported and unit-tested. **usePromotion** takes an options object (`resignal`
  re-promotes a toast region). **A modal is not light-dismissed** on either path —
  v0.4.0's platform behaviour, now consistent (the fallback's scrim-click close was
  the asymmetry the double-close defect lived in); the walk skips the modal so an
  outside gesture still reaches a menu above it. Seed re-cut recorded in plugin ADR 006.

### CI made true

- Root workflow: gitleaks installed as a **pinned binary** (the previous
  `gitleaks-action` + `continue-on-error` combination installed nothing and could never
  fail); the template job now runs `verify-template.mjs` — the standalone proof — instead
  of an in-place verify.
- Template workflow: new **append-only `.prompts/` step** (history diff against the
  branch base), making ADR 002/BR-13/NFR-10's CI claim true.

### Documentation now states what the code does

- Mandatory-gate enumerations corrected to all **13** in five places (SKILL, AGENTS,
  decision-table, ADR 009, config comment). SECURITY.md and ADR 100 state the honest CSP
  story (strict script-src ships in *preview*; dev relaxes for HMR; style nonces cannot
  cover React's style attributes). Preview CSP hardened: scheme-only `ws:` dropped from
  `connect-src`. BR-11 re-homed to ADRs 008/020 (021 retired, recorded in §19.8).
  Scaffold record, README layout (`gallery/` → `harness/`), locales default (`["en"]`,
  pseudo is generated) and the ADR band table (pre-written 020/100, first security ADR
  is 101) all corrected. Overrides section points at `pnpm-workspace.yaml` as the single
  source (eight pins, advisory ids inline).

## 0.4.0 — 2026-08-12

Production-grade release. Four workstreams, each with its decision record; the design
is `docs/specs/2026-08-12-production-grade-design.md` and the deviations found during
implementation are recorded inline there and in the commits.

### Layering — overlays live in the browser's top layer (ADR 003 plugin / 008 template)

- Every surface (Dialog, Menu, ToastProvider, new **Tooltip**) is promoted into the top
  layer as a manual popover, ordered by **when it opened** — never by a per-kind scale,
  which inverts as soon as a stack is two deep. A hostile `z-index: 2147483647` in app
  code no longer competes at all.
- `showModal()` was tried, implemented and **refuted by a browser test**: its native
  inertness also killed every surface promoted above the modal. One mechanism for every
  surface removed the interaction; the finding is recorded in ADR 008.
- New `packages/proto-ui/src/overlay/` subsystem, one module per concern: stack,
  capability detection, platform adapter, dismissal (one `keydown` owner, topmost only),
  refcounted scroll lock and inert background, focus scope with return-through-a-stack,
  anchoring (CSS anchor positioning with rect fallback).
- `tokens.layer` shrank to `base / raised / sticky / overlay`; the per-kind entries were
  the defect, and `layer:scan` fails if any returns. Rules 4–9 make the composition a
  requirement: one dismiss owner, one reader of the scale, platform calls only in the
  adapter.
- **Breaking (seed):** `ProtoUIProvider` lost its `provider` prop, the `own | radix`
  switch is retired, `@radix-ui/react-dialog` removed. ADR 021 deleted; 008/020 rewritten
  in place (the template's ADR set is a seed document, not a history).

### Testing — three mechanical claims, each gated

- **Coverage 100/100/100/100 on every glob.** `coverage:policy` locks the thresholds and
  the reasoned exclusion allow-list in CI; the `ignores` gate pins the `v8 ignore`
  population (currently **zero**) and requires each to name its browser evidence.
- **Mutation testing** (`test:mutation`, Stryker, break 90) on the behavioural core; the
  scope narrowing and its reasons live in the register §3.2. Three real assertion gaps
  found and fixed on the first run.
- **Fixture factories:** `defineFactory(schema, defaults)` parses every fixture through
  the domain schema; `stub:scan` rejects hand-written fixture literals.
- **Generated Playwright component suite** from `src/harness/cases.ts` (pure data) +
  `mounts.tsx`: per case axe (0 serious/critical), visible focus rings, hit-test and
  clipping assertions. Sixteen-case adversarial layering suite, including
  dialog-over-dialog Escape order, menu-under-later-dialog, `contain: paint` ancestors,
  scroll-lock refcounting, inert background, forced-colors and reduced-motion. 83 E2E
  tests. The suite found a real dismissal race on its first run (fixed in `useDismiss`).
- `overlay:matrix` — the no-gaps gate: every exported component must be classified,
  unit-tested, mounted, browser-covered and documented; unclassified fails.
- SRP with numbers: `max-lines` 200, `max-lines-per-function` 60, `complexity` 8.

### Standalone — the plugin carries its own norm and manifests (ADR 001, 002, 004 plugin)

- `references/requirements.md`: the normative register reconstructed **in-repo** — 27
  rules, every one carrying its enforcer and its demonstrated failure case; §19 records
  what the evidence could not settle.
- `scripts/citations.mjs` fails on a dangling citation, an unenforced rule, **and a gate
  no rule motivates** — the check that found two undocumented gates on its first run.
- Plugin manifest + marketplace listing live here; `manifest:lint` keeps four manifests
  agreeing. Repo-level `pnpm verify` (seconds) and `pnpm verify:template` (the real
  proof: scratch copy, frozen-lockfile install, full template verify).
- `gates:selftest` grew from 7 to 16 covered gates (~40 new failure cases): the nine
  gates that had none — including docs:verify's load-bearing "a screenshot of older code
  fails" — are now demonstrated, not asserted.

### External sync — MDX records with provenance (BR-18)

- Everything pushed to or pulled from Confluence/JIRA exists as
  `docs/external/<source>/<id>.mdx`: url, remoteVersion/remoteUpdatedAt, syncedAt,
  direction, **affectedFiles** (non-empty — derived on push, declared on pull). The
  records replace the JSON ledger.
- `sync:pull` (storage→Markdown, round-trip proven), `sync:status` (drift report naming
  the affected local files), `external:verify` (mandatory gate).

## 0.3.0 — 2026-08-11

Mandatory translation, addressability and docs gates (template ADR 009); configurable
gates with waiver-gated relaxation; JIRA/Confluence staging with an outbox.

## 0.1.0 — 2026-07-05

Initial public release.
