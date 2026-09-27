# proto-forge

Turn a one-paragraph product brief into a **first shippable product slice** — a
web application, backend service, desktop application, or composed workspace that
compiles, passes its own tests, and clears the gates defined by its template. Not a
throwaway.

proto-forge is a [Claude Code](https://claude.com/claude-code) plugin with four
skills. You give Claude a short brief; the main skill drives a deterministic,
gated pipeline that
scaffolds the app, models the domain, builds features from an owned component
library, hardens security, and tags a release — with an ADR ledger and an
append-only prompt log recording every decision.

> **Deterministic by design.** The same normalized brief always yields the same
> file tree, ADR set, and components. The guarantee is *structural* determinism:
> you fill domain content inside a fixed skeleton — you never reinvent the
> skeleton, layout, test structure, or ADR numbering.

---

## Documentation

- [Documentation index](docs/README.md)
- [Getting started](docs/GETTING_STARTED.md)
- [Usage guide](docs/USAGE.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Pipeline](docs/PIPELINE.md)
- [Skill reference](docs/SKILLS.md)
- [Template reference](docs/TEMPLATE_REFERENCE.md)
- [Generated repository](docs/GENERATED_REPOSITORY.md)
- [Development and contribution](docs/DEVELOPMENT.md)
- [Verification model](docs/VERIFICATION.md)
- [Continuous integration](docs/CI.md)
- [Security model](docs/SECURITY.md)
- [Integrations](docs/INTEGRATIONS.md)
- [Release guide](docs/RELEASE.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Known limitations](docs/KNOWN_LIMITATIONS.md)
- [Glossary](docs/GLOSSARY.md)

---

## What you get

Every run produces one or more repositories with template-specific guarantees. The
web/desktop-only and backend-only capabilities are labelled below; composition
templates have smaller orchestration contracts documented in the
[template reference](docs/TEMPLATE_REFERENCE.md).

- **Web/desktop — owned component library** (`@jj/proto-ui`) — Button, Field, Select, Checkbox,
  Dialog, Menu, Table, Tabs, ToastProvider, Portal + design tokens, 100% tested.
  No unowned UI dependency you can't patch.
- **Application templates — zero placeholders, zero dead ends** — no `TODO`, no `throw new Error("not
  implemented")`, no mocked first-party modules — and no control whose only
  behaviour is to explain the feature is missing: "not available in the
  prototype" copy fails the build in code *and in every locale catalogue*, a
  no-op handler fails, and an accepted CRUD flow ships every screen and action
  it implies (BR-44). Real Dexie/IndexedDB persistence, real typed API clients,
  real seed data — and settings that survive a rebuild, because user state
  lives behind the repository port, never in ad-hoc web storage (BR-48).
- **Web/desktop — full test pyramid** — Vitest unit/component tests with layered coverage
  floors, Playwright E2E covering happy *and* error paths, axe a11y checks.
- **Web/desktop — WCAG 2.2 AA target** — keyboard paths are verified in E2E and
  accessibility strings are i18n keys; manual conformance testing remains required.
- **Web/desktop — actually translated i18n** — not "i18n-ready". Every locale must reach full key
  parity with non-empty values, matching interpolations and the plural forms the
  language really needs; a value copy-pasted from English **fails the build**.
- **Web/desktop — popups that are genuinely on top** — one stacking scale in the design tokens,
  every overlay portalled to a body-level root, proven against real browser paint
  order rather than by reading back a `z-index`.
- **Web/desktop — a documented, photographed component catalogue** — every component and feature
  has a page with a screenshot, and a lock file makes a stale screenshot fail.
- **Application templates — a security baseline** — controls vary by stack; web and
  desktop include strict CSP, Zod boundary validation, and a single `SafeHtml`
  sanitized-HTML entry point. Every application template carries secret scanning
  and a stack-appropriate dependency-vulnerability gate.
- **Application templates — a decision trail** — one accepted [ADR](https://adr.github.io/) per commit, plus
  an append-only, English-only prompt log; every commit is authored by the operator
  who ran the prompt with the preparing model as co-author (BR-46); a CycloneDX
  SBOM and a structure snapshot per release.
- **api-node — a served, exampled backend contract** — the generated service answers
  `/openapi.json` with the committed contract byte-for-byte and `/docs` with an
  owned, dependency-free explorer showing captured request/response examples and
  curl usage; collections are paginated by contract-gate (landed for `api-node`,
  staging per the spec); the delivery pipeline carries a perf-smoke stage with
  coarse latency/error/image-size ceilings and a published trend.
- **Application templates — two gate lanes** — `pnpm verify:fast` is the per-iteration bar: unit tests +
  every offline structural scan, executed **in parallel** so the wall clock is
  the slowest gate, not the sum; the chain is pinned and `config:check` fails a
  drifted one. `pnpm verify` runs every gate at the test-build checkpoint,
  release and CI; other phases add their named gate to the fast lane.
  `pnpm gates:selftest` proves each gate still rejects what it claims to.
- **Application templates — defects become issues with regression tests** — a known defect is recorded
  the moment it is known (GitHub issue, or a proposed ADR without a tracker),
  and `commit-lint` refuses a `fix:` commit that stages no test: the fix and
  the test that pins it closed land together (BR-49).

---

## Install

Two ways — pick one.

### A. Repository marketplace (recommended)

This repository carries its own Claude Code marketplace. From inside Claude Code:

```
/plugin marketplace add JirakJ/proto-forge
/plugin install proto-forge@proto-forge
```

`marketplace add` registers the marketplace (once); `install` pulls the
plugin and enables it. Update later with `/plugin marketplace update proto-forge`
then re-install. A downstream marketplace may mirror a tagged release, but its
version should be verified separately.

### B. Skill directory (manual)

This repository is **private**, so a direct clone needs access; the plugin store
above is the distribution path. With access, drop the skill straight into your
Claude Code skills directory:

```bash
git clone git@github.com:JirakJ/proto-forge.git
cp -R proto-forge ~/.claude/skills/proto-forge
```

Restart Claude Code (or start a new session). The skill self-registers from its
`SKILL.md` frontmatter.

> Use **A or B**, not both — installing the plugin *and* the standalone skill
> registers `proto-forge` twice.

**Requirements for repository development and generated prototypes:** Node 22.x and
[pnpm](https://pnpm.io) 10.11.0, plus the native toolchain selected by the template.
The skill itself needs only Claude Code. See
[`docs/GETTING_STARTED.md`](./docs/GETTING_STARTED.md) for stack-specific tools.

---

## Usage

Trigger the skill from any Claude Code session:

```
/proto-forge

Build a personal recipe manager. A user can add a recipe (title, ingredients,
steps, tags), edit it, delete it, and search recipes by tag. Recipes are saved
locally on the device. English and Czech UI.
```

Or in plain language — the skill triggers on phrases like *"forge a prototype"*,
*"scaffold an app"*, *"build me an MVP"*:

```
Forge a prototype: a habit tracker where a user creates habits, checks one off
each day, and sees a weekly streak. Persist locally.
```

Claude derives the target(s) from your brief, copies the matching template(s),
normalizes the brief into typed *facets*, then runs the pipeline phase by phase —
each phase gated, each ADR its own commit. Ten templates ship
(`references/templates.json`): the **web** app (React 19 + TS + Vite), five
**backend** stacks — `api-node` (Fastify), `api-java` (Spring Boot), `api-kotlin`
(Ktor), `api-python` (FastAPI), `api-dotnet` (ASP.NET Core) — with the architecture
(layered / modular monolith / hexagonal) **derived from the brief's complexity**,
two **desktop** shells over that same web UI — `desktop-tauri` and
`desktop-electron`, whose shell security posture is itself a gated configuration —
and the **workspace** + **e2e** templates
that compose a frontend and a backend as separate repositories in one workspace,
sharing an OpenAPI contract and proven by a cross-app Playwright layer. A second
skill, **`proto-forge:discovery`**, turns a brief + Figma + Confluence into a
SPIN/DAPA gap-analysis with pre-allocated testids that Phase 0 ingests. A third,
**`proto-forge:survey`**, reads a system that already exists and states what is in
it — every capability citing the file and line that proves it, every row saying
whether it was observed or inferred — and hands that to discovery as a pinned
source, so the same Q1-Q24 taxonomy asks its questions about real code.

```
/proto-forge
A parcel-tracking service: couriers update parcel status over a REST API, a
dispatcher watches deliveries on a dashboard. Backend in Java. Integrations:
the SMS gateway and the customs registry.
```

That brief derives `api-java` + `web` + `e2e` in one workspace — and with three
external systems it would cross the hexagonal threshold (T15).

### More example briefs

```
/proto-forge
An expense splitter for shared households. Roles: member, admin. A member adds
an expense (amount, payer, participants, note); the app shows who owes whom.
Admin can remove members. Data lives in a REST API described by ./openapi.yaml.
```

```
/proto-forge
A read-it-later bookmark app. Add a URL, tag it, mark as read, filter by tag or
read state. Local persistence. Accessible, keyboard-first.
```

The richer the brief (entities, flows, roles, persistence intent), the less the
skill has to escalate. If a detail is missing, it does **not** guess — it records
the ambiguity, emits a `proposed` ADR with options, and picks the most
conservative standard default.

---

## The pipeline

Ten gated phases; a phase never starts until the previous gate is green.

```
Phase 0  BRIEF INTAKE      → normalized facets + prompt-log seed
Phase 1  SCAFFOLD          → fixed repo skeleton (ADR 001-004)
Phase 2  DOMAIN MODEL      → typed domain + zod schemas (ADR 010-019)
Phase 3  COMPONENT LIBRARY → seed @jj/proto-ui + provider selector (ADR 020-021)
Phase 4  FEATURE BUILD     → features from library (ADR 030-099, loop)
Phase 5  I18N + A11Y PASS  → translate every locale + pseudo + axe (gate)
Phase 6  TEST BUILD        → unit + component + E2E (gate)
Phase 7  SECURITY HARDEN   → baseline controls + scans (ADR 100-199)
Phase 8  DOCS + SWEEP      → catalogue, screenshots, dedup (gate)
Phase 9  RELEASE           → SemVer tag + changelog + SBOM + snapshot
```

Full mechanics — decision table, ADR bands, gate-failure protocol — are in
[`SKILL.md`](./SKILL.md) and [`references/decision-table.md`](./references/decision-table.md).

---

## What a generated web project looks like

```
packages/proto-ui/     owned component library, 100% tested, byte-pinned by sha256
src/
  app/                 shell + single-source route table
  config/              zod-validated env (single source)
  domain/<entity>/     pure model + zod schema + repository port
  infra/               real adapters (persistence/api/auth) implementing ports
  i18n/                i18next setup, catalogues, identical-to-default allowlist
  features/<feature>/  slices composed from proto-ui (ui + hooks + tests + e2e)
  gallery/             component catalogue for screenshots — never in a prod build
  shared/SafeHtml.tsx  the only sanitized-HTML entry point
docs/adr/              ADR ledger (one accepted ADR = one commit)
docs/components/<C>/   per-component page + screenshots + .shot.lock
docs/features/<f>/     per-feature page + screenshots + .shot.lock
.prompts/              append-only prompt log
.proto-forge/          config + snapshot + seed lock + facet schema + outbox
.claude/               guardrail hooks (seed, thresholds, gate bypasses, network)
AGENTS.md              the rules any agent working in the repo must satisfy
scripts/               the gate scripts (and their self-test)
e2e/                   Playwright specs (+ axe, + the overlay layering proofs)
```

Run it:

```bash
pnpm install
pnpm dev            # http://localhost:5173
pnpm verify         # every gate, fail-fast
pnpm config:show    # which gates are in force, and where each setting came from
pnpm docs:shots     # re-capture the component screenshots
```

The web template's current `verify` chain is defined in its `package.json`; it
includes configuration/environment checks, gate self-tests, lint/type/build,
coverage and mutation, deployment and bundle budgets, i18n, overlay and test-id
checks, documentation and external-record checks, contract-client verification,
stub/ADR/prompt/duplication/consistency checks, security scan and conformance,
snapshot comparison, browser E2E, and generated quality/status verification.
Other templates define their own stack-appropriate chains.

The shipped `templates/web/` includes a self-verifying demo feature (a Notes app). On
a real run the skill **deletes** the demo and builds your brief's features under
the same per-feature Definition of Done — so `templates/web/` is both the skeleton and
a working reference of the output standard.

---

## Configurable, without becoming unenforced

Every gate is configurable through `.proto-forge/config.json` (merged over strict
defaults and an optional machine-wide `~/.config/proto-forge/config.json`). The
configuration is deliberately asymmetric:

- **Tightening is free.** Raise a threshold, widen a scan, switch a gate on.
- **Relaxing a mandatory gate is not.** i18n, testid, layer, docs, security, stub,
  consistency and snapshot may drop below `error` only with a `waivers[]` entry
  carrying a reason, an ADR that exists, and an expiry date. Without a live waiver
  the setting is *ignored* and the gate runs at `error` anyway. With one, the run is
  stamped `conformance: "waived"`, the relaxation prints on every verify, and it
  expires by itself.

```json
{
  "gates": { "i18n": { "mode": "warn" } },
  "waivers": [
    { "gate": "i18n", "reason": "single-locale pilot for the September demo",
      "adr": 150, "expires": "2026-09-30" }
  ]
}
```

`.claude/settings.json` adds local hooks that block the edits which quietly undo a
gate: touching the byte-pinned component seed, rewriting an append-only prompt-log
entry, lowering a coverage threshold or budget ceiling, `--no-verify`, or a network
call to a host that is not on the allowlist. `AGENTS.md` states the same rules in
prose for agents whose CLI has no hook mechanism.

## Optional JIRA + Confluence

Both are **off by default**, and enabling them does not make anything happen: no
pipeline phase ever calls out. `pnpm sync:jira` and `pnpm sync:confluence` stage
payloads into `.proto-forge/outbox/` for review. A live write needs `dryRun: false`,
an open network guardrail with the host allowlisted, `--commit --approve`, and
credentials read from the environment variables the config *names* — never from the
config itself. Generating a prototype must not, as a side effect, file tickets in a
project other people work in.

## Not integrated: Laya / Jev

[Laya](https://github.com/NandhaKishorM/laya) — a non-autoregressive typed-decision
engine (ModernBERT/mmBERT classifiers speaking the Jev decision protocol) — was
evaluated and is deliberately **not** part of proto-forge:

- **Nothing to classify.** Phase 0 normalizes a brief into facets — extraction of
  entities and relations against `references/facets.schema.ts`, not a choice among
  labels. Model routing (BR-50) is a static, reviewed table.
- **It would break determinism.** The normalized brief *is* the brief identity, and
  gates must be exact. A probabilistic classifier (~0.77 reported accuracy) in
  either path turns a structural guarantee into a statistical one.
- **Disproportionate footprint.** Python, PyTorch, transformers and multi-hundred-MB
  checkpoints (ideally a GPU) would enter a plugin whose own gates exist to keep
  the supply chain small and `pnpm verify` reproducible.
- **Pre-1.0.** The 0.3.x API is still moving.

If a real brief needs text triage, routing or moderation inside the *generated*
application, that is a template capability decided by its own ADR (a `laya-serve`
sidecar or the ONNX `laya-ts` port behind a typed client) — not a dependency of the
generator.

---

## Repository layout

```
SKILL.md                     the main skill + full pipeline spec
skill.json                   skill manifest (name, version)
skills/discovery/            the second skill: SPIN/DAPA gap analysis + its mini-template
skills/survey/               the third skill: existing-system inventory + its mini-template
skills/elicit/               the fourth skill: stakeholder evidence instruments
references/
  templates.json             the template registry every plugin gate loops over
  decision-table.md          T1-T25 when→then rules + ADR ranges
  models.json                the model registry: tiers, list prices, co-author identities, routing table
  model-routing.md           the routing table with its reasons (BR-50)
  facets.schema.ts           canonical brief schema (Phase 0 target)
  requirements.md            the normative register (BR/NFR rules, BRS sections)
  adr-template.md            MADR ADR skeleton
  security-controls.json     security control catalogue and gap register
templates/
  web/                       React 19 + TS + Vite app (a full working app)
  api-node/                  Fastify service (PGlite-verified Postgres persistence)
  api-python/                FastAPI service (uv-locked)
  api-java/                  Spring Boot service (Gradle-locked)
  api-kotlin/                Ktor service (Gradle-locked, Exposed + Flyway)
  api-dotnet/                ASP.NET Core service (.NET 10, locked NuGet restore)
  desktop-tauri/             Tauri 2 desktop shell over the web UI
  desktop-electron/          Electron desktop shell over the web UI
  workspace/                 the <project>/ container for composed FE+BE projects
  e2e/                       the cross-app Playwright layer (flows + contract checks)
docs/adr/                    the plugin's own decision records
docs/                        architecture, operations, security and contributor guides
plugin/                      the installable (.claude-plugin/plugin.json)
```

---

## License

MIT — see [LICENSE](./LICENSE).
