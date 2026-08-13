# ADR 009: The shared delivery surface is pinned by a gate, not by a fifth copy

- Status: accepted
- Date: 2026-08-13
- Prompt-log: docs/specs/2026-08-13-v0.6.0-design.md (Pilíř 2, multi-template
  parametrization)

## Context

Four app templates now carry the same delivery design: the consent library
(`deploy-lib`), the plan emitter, the operator scripts, `deploy:verify`, the chart
templates, the vendored schemas and the two workflows. The v0.6.0 spec proposed a
plugin-level `shared/deploy/` directory of canonical copies plus a sync gate. The
first half of that proposal conflicts with a harder rule: every template is
**standalone** — copied per run, verifying on its own — so the shareable files must
live inside each template regardless, and a `shared/` directory would be a fifth
copy that nothing installs and someone must still keep in step.

## Decision

No `shared/` directory. The plugin gate `deploy:sync` (in `pnpm verify`) pins the
declared shareable set **byte-identical across the templates that carry it**, with
the canonical copy named per set: the app-template corpus (consent/plan/operator
scripts, `deploy-verify`, chart templates, vendored schemas, `values/dev.yaml`,
`package.yml`, `cd.yml`) is canonical in `web`; the backend corpus (`smoke.mjs`,
`Chart.yaml`) is canonical in `api-node`. Declared divergences — Dockerfile,
compose, `values.yaml`, `env-verify`'s schema-parity check, `env-local`'s seed
block, the config blocks, `DEPLOYMENT.md`, ADR 201 (prototype namespace) — are
simply not in the manifest. Moving a file out of the shareable set is an edit to the gate's manifest,
reviewed like any gate edit.

## Consequences

A fix to the delivery surface lands in the canonical template and the gate fails
until every copy carries the same bytes — drift is impossible to ship, and the
"where do I edit this?" question has a mechanical answer. Cost: propagating a
canonical edit is a four-file copy; accepted, because the alternative was a fifth
copy plus the same propagation.

## Alternatives considered

**`shared/deploy/` canonical directory** — the spec's own proposal; rejected as a
copy nothing installs (standalone templates must carry the files anyway).
**Symlinks into a shared dir** — break `cpSync`-based scaffolding and the byte-pinned
seed story. **Convention without a gate** — the v0.5.0 audit showed exactly how such
conventions decay.
