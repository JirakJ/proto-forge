# proto-forge

Turn a one-paragraph product brief into a **first shippable product slice** — a
production-grade React 19 + TypeScript + Vite prototype that compiles, passes its
own tests, and clears security + accessibility + i18n gates. Not a throwaway.

proto-forge is a [Claude Code](https://claude.com/claude-code) **skill**. You give
Claude a short brief; the skill drives a deterministic, gated pipeline that
scaffolds the app, models the domain, builds features from an owned component
library, hardens security, and tags a release — with an ADR ledger and an
append-only prompt log recording every decision.

> **Deterministic by design.** The same normalized brief always yields the same
> file tree, ADR set, and components. The guarantee is *structural* determinism:
> you fill domain content inside a fixed skeleton — you never reinvent the
> skeleton, layout, test structure, or ADR numbering.

---

## What you get

Every run produces a repo with these guarantees baked in:

- **Owned component library** (`@jj/proto-ui`) — Button, Field, Dialog, Menu,
  Table, Tabs, Toast + design tokens, 100% tested. No unowned UI dependency you
  can't patch.
- **Zero placeholders** — no `TODO`, no `throw new Error("not implemented")`, no
  mocked first-party modules. Real Dexie/IndexedDB persistence, real typed API
  clients, real seed data.
- **Full test pyramid** — Vitest unit/component tests with layered coverage
  floors, Playwright E2E covering happy *and* error paths, axe a11y checks.
- **WCAG 2.2 AA** — keyboard paths verified in E2E, a11y strings are i18n keys.
- **i18n from day one** — i18next, every user-visible string externalized, a
  generated pseudo-locale that fails the build on missing keys.
- **Security baseline** — strict CSP, zod validation at every boundary, a single
  `SafeHtml` sanitized-HTML entry point, `gitleaks` + `pnpm audit` hard-stop gates.
- **Decision trail** — one accepted [ADR](https://adr.github.io/) per commit, plus
  an append-only prompt log; a CycloneDX SBOM and a structure snapshot per release.
- **One gate command** — `pnpm verify` runs every gate; local and CI are identical.

---

## Install

The skill lives under your Claude Code skills directory:

```bash
git clone https://github.com/JirakJ/proto-forge.git
cp -R proto-forge ~/.claude/skills/proto-forge
```

Restart Claude Code (or start a new session). The skill self-registers from its
`SKILL.md` frontmatter.

**Requirements for generated prototypes:** Node ≥ 20, [pnpm](https://pnpm.io) ≥ 9.
The skill itself needs only Claude Code.

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

Claude copies the template, normalizes your brief into typed *facets*, then runs
the pipeline phase by phase — each phase gated, each ADR its own commit.

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
Phase 5  I18N + A11Y PASS  → externalize + pseudo + axe (gate)
Phase 6  TEST BUILD        → unit + component + E2E (gate)
Phase 7  SECURITY HARDEN   → baseline controls + scans (ADR 100-199)
Phase 8  CONSISTENCY SWEEP → dedup + contradiction scan (gate)
Phase 9  RELEASE           → SemVer tag + changelog + SBOM + snapshot
```

Full mechanics — decision table, ADR bands, gate-failure protocol — are in
[`SKILL.md`](./SKILL.md) and [`references/decision-table.md`](./references/decision-table.md).

---

## What the generated project looks like

```
packages/proto-ui/     owned component library, 100% tested
src/
  app/                 shell + single-source route table
  config/              zod-validated env (single source)
  domain/<entity>/     pure model + zod schema + repository port
  infra/               real adapters (persistence/api/auth) implementing ports
  i18n/                i18next setup, en + generated pseudo catalogues
  features/<feature>/  slices composed from proto-ui (ui + hooks + tests + e2e)
  shared/SafeHtml.tsx  the only sanitized-HTML entry point
docs/adr/              ADR ledger (one accepted ADR = one commit)
.prompts/              append-only prompt log
.proto-forge/          structure snapshot + seed lock + facet schema
scripts/               the custom gate scripts
e2e/                   Playwright specs (+ axe)
```

Run it:

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm verify     # every gate: lint, types, unit, e2e, i18n, adr, prompt, dup,
                # consistency, security, snapshot
```

The shipped `template/` includes a self-verifying demo feature (a Notes app). On
a real run the skill **deletes** the demo and builds your brief's features under
the same per-feature Definition of Done — so `template/` is both the skeleton and
a working reference of the output standard.

---

## Repository layout

```
SKILL.md                     the skill definition + full pipeline spec
skill.json                   skill manifest (name, version)
references/
  decision-table.md          T1-T13 when→then rules + ADR ranges
  facets.schema.ts           canonical brief schema (Phase 0 target)
  adr-template.md            MADR ADR skeleton
template/                    the fixed skeleton copied per run (a full working app)
plugin/                      packaging notes for the agentic-os marketplace
```

---

## License

MIT — see [LICENSE](./LICENSE).
