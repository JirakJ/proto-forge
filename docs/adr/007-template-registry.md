# ADR 007: The template registry — one plugin, N templates

- Status: accepted
- Date: 2026-08-13
- Prompt-log: docs/specs/2026-08-13-v0.6.0-design.md (the v0.6.0 plan: backend
  templates, CI/CD environments, discovery skill)

## Context

v0.5.0 shipped one template at a hardcoded path. Six plugin-level consumers spelled
`template/` by hand: citations, template-integrity, verify-template, the CI workflow,
the root package.json description and the prose in SKILL.md/README/register. v0.6.0
adds backend templates (api-node, api-java, api-python); every one of those consumers
must iterate, and a hardcoded path in even one of them means a template the gates
silently skip.

## Decision

`references/templates.json` is the registry — the single source (BR-15) every
plugin-level gate loops over: `{ id, dir, kind: frontend|backend, stack, notAGate[] }`
per entry. The existing template moved to `templates/web/` by `git mv`; the move does
not invalidate `seed.lock` or `snapshot.json`, because the tree hash is cwd-relative.

- **citations** builds its script/selftest/ADR-namespace maps from the registry, and
  rule scopes (`- **Scope:** all | frontend | backend | <id> | plugin`, absent = `web`)
  bind each rule to the templates it covers. An enforcer must exist in EVERY covered
  template — identical gate names across stacks are forced by the gate, not by
  convention. `notAGate` moves into the registry, per template.
- The decision-table row regex is built from the table itself (range 1..maxRow), so a
  grown table needs no gate edit, and citing a removed row still fails.
- **manifest-lint** validates the registry shape: required fields, unique ids, known
  kinds, and the complete template shape (package.json with verify, gates-selftest,
  snapshot-diff, the .proto-forge pins, docs/adr) — a half-template fails HERE, not in
  whichever gate trips over it first.
- **template-integrity** runs every template's own snapshot:diff, naming the template
  in its verdict. **verify-template** takes `--template <id>` and scratches to
  `.scratch/verify-<id>`; CI fans out as a matrix over the registry, one leg per
  template, with per-stack setup steps.

## Consequences

Adding a template = one registry entry plus the tree it names; the gates then demand
the rest (shape, seed pin, snapshot, selftests, register rules for every script). The
ADR namespace rule generalizes: a file under `templates/<id>/` cites its own tree by
default; plugin-side prose annotated "(prototype namespace)" resolves against any
template — the seed ADRs all templates share are legitimately discussed as one set.

## Alternatives considered

**Keeping `template/` for web and adding `templates-be/<stack>/`** — the "zero churn"
is illusory: every consumer must learn to iterate either way, and the asymmetric
layout means two path conventions forever. **Deriving the registry from a directory
glob** — a glob cannot carry `kind`, `stack` or `notAGate`, and a stray directory
would silently become a template; an explicit registry fails loudly instead.
