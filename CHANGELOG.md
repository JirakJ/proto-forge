# Changelog

## 0.12.1 — 2026-10-27

Security maintenance across every template (PR #22).

- `api-java`: Spring Boot 4.0.8 / Spring 7.0.9 migration closes the remaining
  Spring MVC findings, with patched Jackson and Tomcat floors (template ADR 203).
- All templates: dompurify 3.4.17, zod 4, vite/vitest patch bumps and refreshed
  `pnpm-workspace.yaml` overrides (brace-expansion, undici, fast-uri, handlebars
  4.7.10, …); a vendored `braces 3.0.4-security.1` backport for CVE-2026-93687
  with a reproducible build recipe, provenance and license.
- `desktop-tauri`: block-buffer GHSA-qwgh-2vcv-g2f7 triaged in `audit.toml`
  (fix needs digest 0.11, which tauri 2 does not accept); `shell:verify` now
  validates and exports GHSA ids as well as RUSTSEC ones.
- `api-kotlin`: the `org.bouncycastle` floor moves from 1.84 to 1.85 — CRITICAL
  GHSA-9pwp-9qqc-pr26 (name-constraints bypass via a trailing dot in rfc822Name
  and URI) and HIGH GHSA-qp49-qgx5-5m26 (lazy ASN.1 sequence forcing resets the
  nesting-depth guard), both on the Kotlin plugin's artifact-signature-verification
  classpath. `gradle.lockfile` re-resolved in locked mode; `sec:scan` clean.

## 0.12.0 — 2026-09-17

Routing that holds before the fact, and a disclosure policy in every generated
repository (plugin ADRs 024 and 025).

- Pinned subagents (BR-51): `references/agents/` holds one definition per
  delegable routing-table activity — thirteen — with `name` = the activity,
  `model` pinned to the routed tier (`sonnet` for standard, `haiku` for
  economy), a tool allowlist fit for the activity and a system prompt bound to
  the template's `AGENTS.md`; the two frontier-routed activities deliberately
  have none. Every template ships the set byte for byte under `.claude/agents/`;
  `models:lint` proves the pins, the names, the absence of frontier definitions
  and the copies (six new selftest cases). T25 and the skill now dispatch with
  `subagent_type: <activity>` and no `model` parameter.
- `SEC-041` is enforced (SSDF RV.1.3): every app template's `docs/SECURITY.md`
  gains a "Reporting a vulnerability" section (GitHub private vulnerability
  reporting as the channel, with acknowledgement, triage, fix and disclosure
  deadlines), the `disclosurePolicyStated` probe re-derives it in every app
  template's `sec:conformance`, three selftest cases per template prove it, and
  the conformance claims are re-derived. The catalogue reports 7 enforced / 14
  planned controls.
- The `api-*` seed locks are recut for the changed gate script; snapshots
  regenerated.

## 0.11.0 — 2026-09-17

The register pass (plugin ADR 023): the findings `docs/KNOWN_LIMITATIONS.md`
recorded at 0.9.1 that were mechanical to close, closed with enforcers where
the finding was a drift.

- New plugin gate `skill:gates` (§17.3): `SKILL.md`'s mandatory-gate sentence
  and its `verify` chain are compared, in order, against the web seed's
  `MANDATORY_GATES` and `package.json`; the prose is regenerated (17 mandatory
  gates, the 30-command chain) and says it is checked. Seven selftest cases.
- `desktop-tauri`: the Rust compiler is pinned in `src-tauri/rust-toolchain.toml`;
  CI reads the channel from the file instead of repeating it, and `shell:verify`
  fails a missing file or a channel that is not `X.Y.Z` (BR-37 amended, two
  selftest cases). Snapshot regenerated.
- CI: the deploy-toolchain step selects kubeconform and hadolint assets from
  `uname -m`, so an ARM64 self-hosted runner gets through the whole matrix; the
  plugin job reads a root `.nvmrc` rather than the web template's.
- Decision table: T1 derives the target before copying and names T14/T24 as its
  first branch; T18 names the Kotlin and C# domain mechanisms.
- Root `SECURITY.md`: GitHub private vulnerability reporting as the channel,
  with acknowledgement, triage, fix and disclosure deadlines (`SEC-041` stays
  `planned` until every template carries a reporting section too).
- Root hygiene: `.claude-flow/`, the proven-config files and the per-session
  anchor are ignored (the anchor leaves history); the marketplace and plugin
  manifest descriptions gain their missing comma.

## 0.10.0 — 2026-09-17

Model routing and derived attribution (`docs/specs/2026-09-17-model-routing-and-attribution-design.md`,
plugin ADR 022): the model that prepared a commit is named by a hook, not by
hand, and every subagent runs on the tier the registry routes its activity to.

- Added `references/models.json`, the model registry (NFR-31): every model the
  pipeline may run on — the current Anthropic and OpenAI generations — with its
  tier (`frontier` / `standard` / `economy`), list price and read date, aliases,
  and the `Co-Authored-By` identity it signs with, plus the routing table that
  maps a delegated activity to a tier. `references/model-routing.md` states the
  reason for every row. Every template ships a byte-identical copy at
  `.proto-forge/models.json`, a protected path; the new plugin gate
  `models:lint` proves the registry's shape, the prose/table agreement and the
  byte-identity of every copy (twelve selftest cases).
- BR-46 amended: the co-author trailer is derived, then verified. Every app
  template gains a `prepare-commit-msg` hook (`scripts/commit-coauthor.mjs`)
  that resolves the model from the cited prompt-log entry's `model:` field,
  `PROTO_FORGE_MODEL`, or `.proto-forge/session.json` — the record the new
  `SessionStart` / `PostModelSwitch` hooks (`scripts/hooks/record-model.mjs`)
  write — and appends the registered identity; `commit-lint` fails a trailer
  that names a model other than the one the cited entry records.
- BR-50, new: every prompt-log entry carries `model:`; a delegated entry
  carries `delegated-by:` and `activity:`. `prompt:lint` enforces the frontier
  rule (a frontier-tier orchestrator delegates to a strictly cheaper tier, no
  override) and the routing rule (the dispatched model sits on the activity's
  routed tier unless `routing-override: <reason>` is recorded). Decision-table
  row T25 and a "Model routing" section in `SKILL.md` state the operating half.
- Ten prompt cases, three hook cases and six commit cases per template suite;
  the shipped scaffold entries record their model; the `api-*`, `e2e` and
  `workspace` seed locks are recut for the changed gate corpus (ADR 022);
  snapshots regenerated.

## 0.9.1 — 2026-09-16

The documentation release, plus the repairs that put the CI template matrix back
to green (it had been red on `api-node`, `api-java` and `api-kotlin` since 0.9.0).

- Added a complete English operator and contributor documentation set under
  `docs/`: architecture, pipeline, skill reference, getting started, usage,
  template reference, generated-repository anatomy, development, verification,
  CI, security, integrations, release, troubleshooting, glossary, and an
  evidence-backed known-limitations register. `docs/adr/README.md` now names the
  `templates/<id>/` trees instead of the pre-registry singular `template/`.
- Refreshed scanner-visible dependency pins: Tomcat 10.1.59 (`api-java`; the
  advisories name 10.1.58 as the fix, which was never published to Maven Central,
  so the lock resolves the next release), Vitest and `@vitest/coverage-v8` 4.1.11
  (GHSA-82fw-gwwq-j7x9; a major upgrade from 3.2.7), and HTTPX2/HTTPCore2 2.13.0.
  Regenerated the affected CycloneDX SBOMs so they describe the committed
  lockfiles rather than superseded dependency versions.
- Vitest 4 fallout, fixed at the source rather than by pinning back: the
  `api-node` request-logger mock is typed as `Mock<Logger["error"]>` (Vitest 4
  no longer accepts `ReturnType<typeof vi.fn>` in an intersection), and the
  web-family `App.test.tsx` now awaits the seeded notes so the demo hook's state
  update cannot land after jsdom is torn down (Vitest 4 reports that as an
  unhandled rejection; Vitest 3 dropped it silently).
- `api-node`: `contract/openapi.json` and `contract.lock` regenerated. zod's
  `date-time` pattern now requires seconds, and the committed spec still carried
  the older optional-seconds pattern, so `contract:verify` had reported drift on
  every CI run since 0.9.0.
- `api-kotlin`: the shipped `.proto-forge/config.json` commits
  `gates.mutation.enabled: true`. ADR 003 makes the tier opt-in by a committed
  line, but `quality:report` requires the PIT report unconditionally, so the
  template could not verify itself with the tier off. The shipped state now
  matches its own `quality.json` (mutation 100 %, break 85).

## 0.9.0 — 2026-08-23

The production output bar (`docs/specs/2026-08-22-production-output-bar-design.md`,
plugin ADRs 015–020): six operator-named gaps between "gated" and "shippable",
closed with enforcers.

- **Dead-end interactions are banned (BR-44, ADR 016).** A control that renders
  must work: `stub:scan` in the web family now fails "not available / coming
  soon / this prototype" copy in code string literals **and in every locale
  catalogue value** (the one place no scan looked), plus hard-coded no-op
  handlers and `href="#"`. CRUD completeness is the Phase-4 DoD; a scope cut is
  an ADR, never UI copy.
- **Two-lane verification, in parallel, with three full-bar checkpoints (BR-45,
  ADR 015).** Every app template ships `pnpm verify:fast` — the per-iteration
  bar — beside the full `pnpm verify`, whose checkpoints are the end of
  Phase 6, release, and CI on every push (Phases 5/7/8 close on the fast lane
  plus their own named gates — five full runs per pipeline become two). The
  lane executes through `scripts/verify-fast.mjs`: `config:check` first, then
  the pinned gates under a machine-sized worker pool (buffered output,
  fail-fast kill on the first red), so the wall clock is the slowest gate
  rather than the sum — measured at 5.1 s (api-node, 20 gates) and 7.6 s (web,
  18 gates). The chain is pinned as `FAST_GATES` and `config:check` fails a
  drifted, inlined or narrowed lane. Warm runs stop paying cold starts:
  `gates:selftest` answers from a content-addressed stamp while `scripts/**`
  is byte-identical to the last green run (`--force` reruns), and eslint/tsc
  cache under `node_modules/.cache` — outside every snapshot and commit.
- **A defect becomes an issue, a fix carries its regression test (BR-49,
  ADR 021).** The defect protocol records a known defect immediately (GitHub
  issue with the repro; a proposed ADR without a tracker), and `commit-lint`
  mechanically refuses a `fix:` commit whose staged diff touches no test file —
  the fix and the test that pins it closed land together, referencing the issue.
- **Provenance is English and correctly attributed (BR-13 amended + BR-46,
  ADR 017).** Prompt-log entries are recorded in English (faithful rendering,
  no translation markers; foreign product strings in backticks) — `prompt:lint`
  enforces it in all three variants. `commit-lint` requires a well-formed
  `Co-Authored-By` model trailer and fails a commit whose git author *is* the
  model: the operator authors, the model co-authors.
- **The service serves its contract (BR-47, ADR 018).** api-node's platform now
  answers `/openapi.json` with the committed contract byte-for-byte and `/docs`
  with an owned, dependency-free, CSP-clean explorer rendering schemas, problem
  types, the captured BR-26 examples (now carrying each scenario's note) and
  curl usage. Injected via `DocsDeps`, shipped into the runtime image, proven by
  the platform unit suite at the 100 % floor; `contract:verify` fails dropped
  wiring. Remaining stacks staged in the spec.
- **The scalability floor (NFR-29 + NFR-30, ADR 019).** `contract:verify`
  rejects top-level-array collections and unpaginated embeds; the demo Note
  slice pages in the engine behind a port that no longer offers unpaged listing,
  and the emitter renders request schemas from zod's input view. The shared
  `package.yml` gains a config-gated **perf-smoke stage** (fixed load, coarse
  ceilings — zero errors, p95 < 1 s, image ≤ 400 MB — trend published to the job
  summary), on for api-node, one reviewed config line per remaining stack;
  `deploy:verify` fails a workflow that lost the stage or its budgets.
- **Settings survive a rebuild (BR-48, ADR 020).** User state persists through
  the repository port; direct `localStorage`/`sessionStorage` in production code
  fails `stub:scan`, and a settings-schema change or reset is an ADR with a
  migration, never a build side effect.

Routed feature pages always show their current visual state (BR-19 tightened);
SKILL.md's Phase-4 DoD, commit discipline ("scoped gates" now *means* the fast
lane) and prompt-log rules restate all of the above for the pipeline.

## 0.8.0 — 2026-08-17

The security baseline stops being defined by itself. Three repairs land with it, one
of which had `pnpm verify` red on `main` for two days.

### The seed pin was right, and `main` was not (BRS §17.2)

`e0be82a` left the `Tooltip` export in `packages/proto-ui/src/index.ts` twice. That
broke two things at once: the vendored tree stopped matching `.proto-forge/seed.lock`,
so `template:integrity` — and with it the whole plugin-level `verify` — was failing at
`HEAD`, reproducible from a clean `git archive` checkout rather than only in a dirty
worktree; and a duplicate re-export of one identifier does not typecheck.

The fix is a removal, not a re-lock. Deleting the stray line reproduces the committed
`72a8671…` exactly, which says the pin held and the tree drifted from it — so no ADR
and no `pnpm seed:lock`, both of which §17.2 reserves for a real upgrade and never for
making a red gate green. The pin did its job; what failed was that its verdict was not
read before the commit landed.

### Advisories are answered where the scanner can see the answer

- **`api-kotlin` netty floor → 4.2.17.Final.** GHSA-8c42-7qj2-3j46: `netty-codec-http`
  overwrites the CORS `Vary` header, so a shared cache in front of the service can serve
  one origin's response to another. It affects 4.2.0–4.2.16, and the `securityPins` floor
  sat at 4.2.16.Final — correct for the http2 DoS batch it was written against, silent
  about the one that landed on top of it. `gradle.lockfile` re-resolved, and
  `.proto-forge/sbom.cdx.json` regenerated: the SBOM is derived from the lock, so after
  the bump it still advertised the vulnerable coordinate, and osv-scanner found it there
  and nowhere else. An SBOM naming a version the build no longer resolves is worse than
  none — it is the artefact a consumer scans *instead of* the lockfile.
- **`desktop-tauri` triage now reaches the scanner that runs.** `src-tauri/audit.toml`
  has carried the tauri-2 linux GTK advisories properly triaged since ADR 203 — reasoned,
  dated, re-reviewed on expiry. The gap was reach, not rigour: cargo-audit reads
  `audit.toml` and nothing else does, while osv-scanner reads `osv-scanner.toml` and
  reported all seventeen as open. The same advisory read "suppressed, with a reason and
  an end date" to one tool and "unanswered" to the next.

  `src-tauri/osv-scanner.toml` is therefore **derived, never authored**: `audit.toml`
  stays the single source (BR-15), `shell:verify` re-renders and compares the way
  `snapshot:diff` does, and drift is a red gate. One ledger, one set of `until:` dates
  expiring in both tools at once. `pnpm osv:ignores` regenerates it and refuses to write
  when the ledger itself is invalid, so a broken ledger cannot be laundered into a
  valid-looking ignore list. Three `gates:selftest` cases (NFR-25), the third pinning the
  exact rendering.

  osv-scanner over the repository: **seventeen findings → zero.**

### Two designs, both `proposed`

- **`docs/specs/2026-08-17-security-layer-design.md`** — OWASP ASVS 5.0 Level 2 as the
  application bar with a ratchet to L3, SLSA v1.1 Build L3, NIST SSDF as the process map.
  A vendored sha-pinned ASVS 5.0 as the normative source, a catalogue mapping requirement
  → control → probe → selftest, and a conformance gate that re-derives and diffs.

  Two things the spec is deliberate about. **Reproducibility has a physical ceiling**: a
  report embedding scanner findings cannot be byte-stable, because CVE feeds move under a
  fixed commit — so the output splits into `conformance.json` (the claim, derived only
  from repository content, hash-gated) and `findings.sarif` (the observation,
  threshold-gated, never hashed). And **requirement numbers are verified, not
  remembered**: the first draft had Trusted Types as an ASVS requirement (they appear
  nowhere in 5.0), SRI at L2 (it is L3) and cookie attributes in V7 (they are in V3).
  Controls wanted beyond the standard are recorded with an empty `requires` and a
  rationale, so our own strictness never reads as someone else's requirement.
- **`docs/specs/2026-08-17-documentation-follows-reality-design.md`** — a decision drags
  its documentation, and documentation never claims what stopped being true. The obvious
  mechanism is wrong and the spec records why: "a commit touching an ADR must also touch
  its docs pages" cannot work, because when only the ADR text changes `docs:shots`
  produces a byte-identical image and `.shot.lock` does not move — there is nothing to
  stage, so the gate would force a cosmetic edit. The direction inverts to a tree
  invariant: the subject's lock gains the ADRs governing it, derived from the `@adr`
  anchors already in the code.

### Note on this release's evidence

GitHub Actions has been unable to start a job on this account since 2026-08-15 —
`The job was not started because recent account payments have failed or your spending
limit needs to be increased` — so no CI run backs this tag. The gates were run locally
instead: plugin `verify` green, and `verify-template` green for the three templates the
changes touch (`web`, `api-kotlin`, `desktop-tauri`). Recorded here rather than left to
be discovered, because ADR 004 makes the gates the interface and a tag CI never saw is
a weaker claim than the usual one.

## 0.7.0 — 2026-08-14

Ten templates, five backend stacks. The registry is the only list anyone maintains:
registering a template is what gives it its CI legs, its gate parity check and its
share of the delivery corpus.

### Two more backend stacks (§19.9, §19.10)

- **`api-dotnet` (C#/ASP.NET Core)** — .NET 10 LTS pinned by `global.json`,
  `packages.lock.json` with locked restore, minimal APIs behind a route registry as
  the single source, native `ProblemDetails` (RFC 9457 lands without a shim, BR-23),
  EF Core migrations under the append-only ledger (BR-24), the contract emitted by
  the app's own `--emit-openapi` mode through the shared normalizer (BR-22), xUnit +
  coverlet at 100 on domain and application, **Stryker.NET** over that scope,
  ArchUnitNET for the three profiles (BR-21), and Testcontainers-for-.NET as the
  real-database tier. Its gated coverage scope is an *include* list, so the template
  ships **zero** exclusions.
- **`api-kotlin` (Ktor)** — Gradle-locked, Exposed + Flyway, contract emitted from
  the route registry and byte-identical across runs, ArchUnit for the profiles,
  detekt at `maxIssues: 0`, JaCoCo 100/100/100 on `app.domain` + `app.application` +
  `app.config` with **zero** `jacoco ignore` markers, PIT over that same set at
  100 % (42/42), 65 unit tests and 9 conformance scenarios, and the same 157-name
  gate-selftest parity as api-node and api-java — proven programmatically, not by
  convention. `app.config` was not in the enforced core at first: it joined once it
  reached 1.00 unaided, and the widening landed in the JaCoCo rule, the PIT scope and
  `coverage-policy.mjs` together, so narrowing it back is a gate edit.
- **Two Kotlin limits are named rather than excluded** (§19.10). kotlinx's generated
  `$serializer` carries a missing-field branch no decoder can reach; instead of
  excluding roughly 6 % of instructions from a 1.00 floor, the wire types carry
  hand-written `KSerializer`s, so what the floor covers is what the tests can drive.
  PIT cannot kill the `Intrinsics` null-checks the Kotlin compiler inserts; the call
  class is skipped, the mutated scope is not, and **both numbers are reported** —
  unfiltered, 29 mutations with 22 kills (76 %) and all seven survivors that one
  intrinsic; filtered, 42 and 42.
- **Exposed has no `ddl-auto=validate`**, so api-kotlin's real-database tier applies
  the committed migrations against Testcontainers Postgres and then reads the live
  catalog back through JDBC metadata, asserting each column and SQL type against the
  Exposed declaration. Stricter in one useful way: a failure names the column and
  the type it actually found.

### Fixed

- **api-dotnet died on a fresh clone at the mutation gate**: `.config/dotnet-tools.json`
  pins the tools, but the resolver cache that makes them runnable is per-machine, so
  CI met `Run "dotnet tool restore" to make the "dotnet-stryker" command available`.
  `test:mutation` now restores the local tools before it uses them, and `tools:restore`
  exposes the step on its own. Reproduced by deleting the resolver cache, not assumed.

### Desktop applications (BR-37, §24, T24)

- **`desktop-tauri` and `desktop-electron`** — the web template's UI half inside a
  shell: owned component library (the proto-ui seed byte-identical to web's),
  i18n, testids, layering, overlays, harness, documentation, coverage 100 and
  mutation ~93 all carry unchanged, because it is the same product; only delivery
  differs. The promotion chain is replaced by **packaging as a CI stage** — verify
  never packages (NFR-16), the three-OS build matrix and the per-OS
  signing/notarization requirements live in each template's DELIVERY.md.
- **The shell is configuration under a gate.** Electron's isolation flags must
  carry their safe values *literally* — a computed value fails, because a flag
  whose value cannot be read is a flag nobody reviewed — with the CSP injected,
  navigation locked to the app origin, the preload exposing only through
  `contextBridge`, and the publish feed off. Tauri's capability allowlist is
  minimal, every extra permission being a gate edit plus an ADR, with the updater
  disabled or its endpoints and key pinned and `Cargo.lock` committed.
- **The advisory ledger has an auditor.** The unmaintained GTK bindings Tauri's
  Linux backend forces (17 advisories) live in a dated ignore ledger under the
  same `reason:`/`until:` discipline `.trivyignore` gets — and `sec:scan` now
  audits `Cargo.lock` against it, printing every accepted advisory with its reason
  and expiry and failing on anything unlisted. One advisory carries different
  identifiers in different namespaces (RUSTSEC to cargo-audit, GHSA to
  osv-scanner), so an entry accepts every identifier it names; a ledger that knows
  one namespace stops matching the day the scanner changes. Stated limit, recorded
  rather than smoothed over: the e2e suite runs against the built assets, not the
  packaged app.

### CI that asks the repository, not a list

- The root workflow's template matrix is **derived from `references/templates.json`**,
  its per-stack setup from each entry's `stack`, its deploy toolchain from whether
  the template actually ships `deploy-verify.mjs`, and its osv-scanner install from
  whether that template's own `sec-scan.mjs` calls it. Three CI failures came from
  one cause — a hand-maintained mirror that the delivery-surface port left behind —
  and this is the shape that cannot drift again: new templates get their legs by
  being registered.
- **A gate that lied is fixed**: api-java reported "found known vulnerabilities"
  while the scanner was printing "could not determine extractor suitable to this
  file". An SBOM was being passed through the lockfile flag (newer scanners
  auto-detect it, the CI-pinned one does not) and *any* non-zero exit was read as
  a finding. The audit now reads the locked graph directly, and exit 1 means
  vulnerabilities while anything else means the audit did not run — which is not
  the same as a clean one.
- log4j-api pinned to 2.25.5 in api-java (MODERATE GHSA-qv9r-c865-cp47, reachable
  only through Boot's logging bridge — pinned anyway, because an advisory a scanner
  can see is one a reviewer has to answer for).

## 0.6.0 — 2026-08-13

From one template to a platform: backend services, multi-environment DevSecOps
delivery, workspace composition and a second skill — designed in
`docs/specs/2026-08-13-v0.6.0-design.md`, held together by a register that grew
from 28 to 50 rules with every one mechanically enforced across six templates.

### The template registry (ADR 007 plugin)

- `references/templates.json` is the single source every plugin gate loops over;
  `template/` moved to `templates/web/` (seed pins survive — the tree hash is
  cwd-relative). Rule **scopes** (`all | frontend | backend | e2e | workspace |
  <id>`) with per-enforcer/per-case kind restrictors: an enforcer must exist in
  EVERY covered template, so identical gate names across stacks are forced by the
  `citations` gate, not by convention. Final count: 562 files cited, 6 templates,
  zero gaps.

### Backend templates — architecture and security as construction (BR-21..26, NFR-11..14, §13-§16)

- **api-node** (Fastify 5 + zod 4 + Drizzle + PGlite at verify time — offline,
  Docker-free), **api-java** (Spring Boot 3.5.16 exact, checksum-pinned Gradle
  wrapper + dependency locks, ArchUnit, JaCoCo 1.00 on the core, PIT), and
  **api-python** (FastAPI + Pydantic v2 + SQLAlchemy/Alembic, uv-locked,
  import-linter, mutmut) — each a complete self-verifying service with the Note
  demo, 27-gate verify, 100% coverage on the gated set and 100% mutation scores
  at first release.
- The architecture is **derived, never chosen**: pure facet counts (entities,
  external systems, entity-graph components) select layered / modular monolith /
  hexagonal (T15-T17); `arch:verify` re-derives on every run and re-proves the
  dependency edges standalone. Contract discipline: `contract/openapi.json` as a
  locked, canonical-JSON derivation of the route registry (BR-22) with a
  dependency-free breaking-change diff; RFC 9457 problem catalogue as the
  backend's i18n-catalogue equivalent (BR-23); append-only migrations (BR-24);
  deterministic operationIds sharing the testid grammar (BR-25); captured docs
  examples with freshness locks (BR-26).

### CI/CD + DevSecOps (BR-27..29, NFR-15..17, §20-§21, ADRs 200-202)

- `environments{}` — local, dev, sit, uat, test, prod — as the single declaration;
  the promotion chain derives from the enabled flags and ships **dev-only**:
  progressive delivery is a reviewed config diff. Digest-pinned non-root
  containers valid under OpenShift restricted SCC and AKS baseline alike; one
  Helm chart per app with per-env values, offline kubeconform validation against
  vendored schemas; `env:verify` + `deploy:verify` join the mandatory set.
- `package.yml` (build → trivy → SBOM → cosign keyless sign/attest → GHCR/ACR)
  and `cd.yml` (config-driven plan, GitHub-environment approvals reconciled
  against config per run, per-digest cosign verify, helm --atomic + smoke
  asserting the served SHA). Operator deploys mirror the BR-20 consent doors —
  staged render to the outbox, `--approve` or committed `autoDeploy`, a
  kubeconfig-context match, and Secrets that are NEVER applied by tooling.
- The shareable delivery corpus is pinned **byte-identical** across app templates
  by the plugin's `deploy:sync` gate (ADR 009 plugin) — no fifth copy; drift
  names its file.

### Workspace composition + the cross-app layer (BR-34/35, §23, T14/T23)

- A brief with a backend yields ONE WORKSPACE: a small git repo (`workspace.json`
  manifest, shared brief, orchestration `ws:bootstrap/status/up`) whose parts —
  `api/`, `web/`, `e2e/` — are separate git repositories with per-repo machinery
  intact; `pairedBrief` agreement is gated. The **e2e template** carries the
  flow suite derived from the flows facets plus consumer-driven contract checks
  with a dependency-free response validator; the against-the-pair run belongs to
  the workspace CI. The web side closes the loop with `contract:client`: the
  typed client is a locked derivation of the BR-18-recorded contract.

### The discovery skill (`proto-forge:discovery`, BR-30..33, §22, ADR 008 plugin)

- Second skill in the plugin: brief + Figma + Confluence → one English
  gap-analysis document per screen/feature/API area — SPIN with evidence,
  DAPA-as-documents (Definition / Acceptance criteria / Prerequisites /
  Assumptions), deterministic pre-allocated `data-testid`s, a fixed Q1-Q24
  question taxonomy, images pinned by node id + sha256, and a `discovery.json`
  bridge the main skill's Phase 0 ingests (facet hash untouched). Ships its own
  dependency-free lint, run over the shipped sample in plugin verify and over
  every output at runtime.

### Quality status, doctor, and tiered self-healing (BR-36, NFR-18, NFR-19)

- **The documentation carries the numbers of the last green verify** in every
  template: `docs/STATUS.md` renders unit counts, the coverage axes vs their
  floors, mutation score vs break, e2e/conformance counts, contract
  operation/problem counts and the full gate chain — derived from
  `.proto-forge/quality.json`, which the test gates' own machine reports produce
  during verify. The `status` gate re-renders the block byte-wise and re-checks
  the config mirrors, so a hand-edited number fails; CI renders the same table
  into the job summary and uploads quality.json. No wall-clock anywhere.
- **`pnpm doctor`** names every known environment failure with its one-command
  fix (engine pins, hooks after clone, installed-tree-vs-lockfile agreement,
  stale mutation caches, ports, browsers, env files, per-stack toolchains);
  TZ=UTC pinned at config level and asserted by the test setups;
  `docs/TROUBLESHOOTING.md` curates the remaining symptom → cause → fix classes
  — including the incidents this plugin's own construction hit.
- **`pnpm heal`** repairs a red verify in three tiers and never any other way:
  mechanical regeneration from a data-driven healing registry (never a snapshot,
  seed, or anything semantic); a bounded agent loop that only exists once
  `selfHealing.agent.enabled` is committed (the autoPropagate consent form),
  which hard-stop gates never enter; then escalation. Every pass writes its
  prompt-log entry before acting; passes stop at the configured bound. The
  optional `heal.yml` runs tier 1 only in CI and opens a PR with the heal log.

### Norm and gate infrastructure

- Facets v2: `facetsVersion` + optional `backend` subtree; brief identity is the
  PAIR (version, hash) — BR-14 amended. Decision table T14-T23; ADR band
  200-209 (delivery). The citations bullet parser now reads wrapped bullets
  whole (continuation lines used to escape checks 4-6), case names normalize
  across line wraps, and inline-block proofs register via `inlineCase()`.

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
