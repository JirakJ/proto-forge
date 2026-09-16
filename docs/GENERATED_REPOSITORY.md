# Anatomy of a generated repository

Every application repository that proto-forge produces is standalone: it carries its
own gates, decision records, provenance, configuration, and delivery assets, and it
never imports anything from the plugin. This page names the control-plane files
that every template shares and explains what maintains them. Product code layout is
described in [Architecture](ARCHITECTURE.md); commands are authoritative in each
template's `package.json` and summarized in [Template reference](TEMPLATE_REFERENCE.md).

## The `.proto-forge/` directory

| File | Owner | Purpose |
| --- | --- | --- |
| `config.json` | Operator | Gate modes, environments, deployment flavor, integrations, guardrails, self-healing, and waivers. Merged over strict defaults and an optional `~/.config/proto-forge/config.json`. |
| `config.schema.json` | Template | JSON Schema for `config.json`; `config:check` validates against it and runs first in every lane. |
| `facets.json` | Phase 0 | The normalized brief. Its hash, paired with `facetsVersion`, is the brief identity. |
| `facets.schema.ts` | Template | A copy of the canonical facet schema so the repository can explain its own input. |
| `architecture.json` | Phase 1 (backend) | `{style, inputs}` of the derived architecture profile; `arch:verify` re-derives it. |
| `seed.lock` | `pnpm seed:lock` | SHA-256 of the immutable seed (the owned component library, or the platform kernel plus gate corpus). A mismatch is either tampering or an unrecorded upgrade. |
| `snapshot.json` | `pnpm snapshot` | The structure snapshot regenerated at the end of Phase 1 and before every accepted-ADR commit; `snapshot:diff` compares against it. |
| `quality.json` | `pnpm quality:report` | Measured facts from the last verification run; `docs/STATUS.md` must mirror it byte-for-byte. |
| `sbom.cdx.json` | `pnpm sbom` | Deterministic CycloneDX inventory derived from the lockfile. |
| `migrations.lock` | Backend | Hash pins of the append-only migration history. |
| `contract.lock` (under `contract/`) | Backend | Lock of the generated OpenAPI document. |
| `security/controls.json`, `security/conformance.json` | Root catalogue and `sec:conformance` | Vendored control catalogue and the derived conformance report with its declared gaps. |
| `standards/asvs-5.0.0.flat.json` | Root catalogue | Byte-identical copy of the pinned ASVS standard. |
| `outbox/` | `pnpm sync:*` | Staged integration payloads. Git-ignored; the durable record of what was sent lives in `docs/external/`. |
| `e2e-results.json`, `integrations.json` | Gates and sync commands | Machine outputs distilled into `quality.json` and the external records. |

## The `.prompts/` directory

An append-only English prompt log. Entry `0001-scaffold.md` is shipped with the
template; `0002-brief.md` is the verbatim brief; `0003-discovery.md` records a
discovery bridge when one was ingested. Every later entry precedes the code or ADR
it produced. A local hook and `prompt:lint` reject edits to existing entries.

## Decision records

`docs/adr/` holds MADR-style records allocated by band, not by encounter order:

| Band | Reserved for | State at scaffold |
| --- | --- | --- |
| 001–009 | Stack, prompt log, tests, i18n, routing, error boundary, budget, overlay layering, mandatory gates | Pre-written `accepted` |
| 010–019 | One per entity, facet order | Demo ADR 010 deleted in Phase 1 |
| 020–029 | Component library, providers, persistence and API adapters | 020 pre-written; demo 022 deleted; 021 retired |
| 030–039, 050–099 | One per flow, facet order | Demo 030 deleted |
| 040–049 | Authentication model and adapter | Empty unless roles are named |
| 100–199 | Security design choices, budget changes, waivers | 100 pre-written |
| 200–209 | Delivery and environments | 200–202 pre-written; desktop shells add 203 |
| 210+ | Post-v1, supersedes, cross-cutting | Empty |

`adr:lint` verifies anchors, statuses, and prompt-log links. It does not verify
bands; band allocation is a pipeline rule checked in review.

## Guardrails

`.claude/settings.json` wires four hooks:

- `guard-write` refuses edits to the byte-pinned seed, the locks, existing prompt
  entries, and any change that lowers a coverage threshold, a budget ceiling, or a
  gate mode;
- `guard-bash` refuses `--no-verify`, force pushes without a lease, `pnpm seed:lock`
  from an agent session (a seed upgrade is an ADR-recorded operator action), and
  network calls to hosts that are not allowlisted;
- `scan-touched` runs the structural scans after every TypeScript edit;
- `stop-gate` sweeps before an agent turn ends.

`AGENTS.md` states the same rules in prose for tools without a hook mechanism.

## Configuration and waivers

Tightening a gate is always allowed. Relaxing a mandatory gate below `error`
requires a `waivers[]` entry with a reason, an existing ADR, and an expiry date.
Without a live waiver the relaxed setting is ignored. With one, every run is
stamped `conformance: "waived"`, the relaxation prints on every verify, and it
expires by itself.

The mandatory set differs by template kind. The web family lists i18n, testid,
layer, docs, security, stub, consistency, snapshot, overlay, coverage, ignores,
mutation, external, env, deploy, client, and status. The Node backend lists arch,
contract, errors, migration, opid, docs, security, stub, consistency, snapshot,
coverage, ignores, mutation, external, log, deps, env, deploy, and status. The
authoritative list is `MANDATORY_GATES` in each template's `scripts/config.mjs`.

## Verification lanes

- `pnpm verify:fast` runs the pinned `FAST_GATES` in parallel with fail-fast
  behavior. It is the bar for every feature commit.
- `pnpm verify` runs the full chain fail-fast: gate self-tests, mutation testing,
  build and budgets, delivery-surface checks, security scans and conformance, the
  browser suite, and the measured status.
- `config:check` fails a `verify:fast` script that drifted from the pinned list.

Composition templates (`workspace`, `e2e`) define only a full `verify` chain.

## Environments and delivery

`config.json` declares the delivery chain with fixed keys: `local`, `dev`, `sit`,
`uat`, `test`, `prod`. An environment exists only by being declared and enabled
there. The Helm values files, the deployment documentation table, and the CD plan
are derived from that declaration, and `env:verify` fails when they disagree. The
template ships with only `dev` enabled.

Delivery assets in application templates:

- `Dockerfile` with digest-pinned, non-root images;
- `deploy/chart/` Helm chart with per-environment values and validated schemas;
- `deploy/compose/` for single-host development mode, refused once any environment
  past `dev` is enabled;
- `.github/workflows/verify.yml`, `package.yml`, `cd.yml`, and `heal.yml`.

`deploy:verify` lints the surface offline and renders it with `helm`, `kubeconform`,
`hadolint`, and `docker` when they are installed. CI installs those tools, so a
locally skipped check is never treated as proof.

## Self-healing and diagnostics

- `pnpm doctor` is the fresh-machine pre-flight: toolchain pins, hook wiring,
  installed tree versus lockfile, stale mutation cache, ports, browsers, and `.env`.
  Every failure prints its fix.
- `pnpm heal` works a red `verify` in three bounded tiers. Tier 1 replays the
  deterministic regenerations from the healing registry. Tier 2 runs a bounded
  agent pass only when `selfHealing.agent.enabled` is committed. Tier 3 prints a
  blocked report and exits non-zero. Hard-stop gates never enter any tier, and every
  pass writes a prompt entry before acting.
- `heal.yml` in CI runs the mechanical tier only and proposes the result as a pull
  request, and only when both the repository variable `HEAL_ENABLED` and the
  committed `selfHealing.ci.enabled` flag consent.

## Status and documentation mirrors

`docs/STATUS.md` carries the numbers of the last green verify. `quality:report`
regenerates the block from machine outputs and `status:verify` fails when the
document, the JSON, and the enforcing configuration disagree. Component and
feature pages under `docs/components/` and `docs/features/` carry screenshots
whose lock files make a stale image fail `docs:verify`.

## Workspace specifics

A workspace repository is deliberately small. `workspace.json` is the single source
of parts, each part directory is git-ignored because it is its own repository, and
`ws:verify` fails when the manifest and the ignore block fall out of step. The
`pairedBrief` hash in the manifest must match every present part's facets record.

## Related pages

- [Pipeline](PIPELINE.md) for how these files are produced phase by phase.
- [Integrations](INTEGRATIONS.md) for the outbox and external-record model.
- [Security](SECURITY.md) for the conformance report and its boundaries.
