# proto-forge — the installable plugin

This repository is the source of truth for proto-forge, and it installs directly:

```
/plugin marketplace add JirakJ/proto-forge
/plugin install proto-forge@proto-forge
```

`.claude-plugin/marketplace.json` at the repository root lists exactly one plugin,
sourced from this directory. `plugin/.claude-plugin/plugin.json` is its manifest,
and its `skills` entry points back at the repository root — the skill (`SKILL.md`,
`references/`, `template/`) *is* the plugin, so nothing is duplicated here.

Four files carry the version and must agree: `package.json`, `skill.json`,
`plugin/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`.
`pnpm manifest:lint` fails when they drift, and `pnpm verify` runs it.

## Releasing

1. `pnpm selftest && pnpm verify && pnpm verify:template` — all green.
2. Bump the version in all four manifests, write the `CHANGELOG.md` entry.
3. Commit, then tag `vMAJOR.MINOR.PATCH`.

A downstream marketplace may mirror this plugin; if one does, it re-pins from a
tag here rather than holding its own copy of the metadata.
