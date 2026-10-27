# ADR 026: The repository root is the plugin root

- Status: accepted
- Date: 2026-10-27
- Prompt-log: CHANGELOG.md 0.12.2 (found by installing from the published marketplace: `claude plugin install proto-forge@proto-forge` failed validation with `skills.0: Invalid string: must start with "./"`)

## Context

ADR 002 made this repository installable on its own: the marketplace listed one
plugin sourced from `./plugin`, and that directory's manifest named the skills
with paths that climbed back to the repository root (`"../.."`,
`"../../skills/discovery"`, …). Both lints resolved those entries against the
manifest's own directory, so they found every `SKILL.md` and passed.

Claude Code does not resolve them that way. A plugin is its source directory,
copied into the plugin cache; every component path must be `./`-relative and
stay inside that directory. The validator rejected all four entries, so
`/plugin install proto-forge@proto-forge` has never worked from the published
marketplace. The green lints were checking a resolution rule the runtime does
not use.

## Decision

The repository root is the plugin root. The marketplace entry's `source` is
`"./"`; the manifest moves to `.claude-plugin/plugin.json`, beside
`marketplace.json`, and names the skills as `"./"`, `"./skills/discovery"`,
`"./skills/survey"` and `"./skills/elicit"`. The old `plugin/` directory is
gone; its README is `docs/PLUGIN.md`.

`manifest:lint` resolves entries against the marketplace source — the rule the
runtime applies — and rejects any entry that does not start with `./` or that
contains a `..` segment, even when it would resolve on disk. `skill-lint`
resolves against the repository root. A selftest case pins the `"../.."` shape
as a failure.

## Consequences

- The plugin installs from `JirakJ/proto-forge`; `claude plugin validate .`
  passes.
- An install copies the whole tracked repository, templates included. That was
  always the content of the plugin — the old layout only pointed at it.
- Downstream marketplaces stop vendoring a copy and reference this one.
