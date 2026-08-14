# proto-forge — the installable plugin

This repository is the source of truth for proto-forge, and it installs directly:

```
/plugin marketplace add JirakJ/proto-forge
/plugin install proto-forge@proto-forge
```

`.claude-plugin/marketplace.json` at the repository root lists exactly one plugin,
sourced from this directory. `plugin/.claude-plugin/plugin.json` is its manifest,
and its `skills` entries point back into the repository — the skills (`SKILL.md` at
the root, `skills/discovery/`) with their `references/` and the ten `templates/`
*are* the plugin, so nothing is duplicated here.

Four files carry the version and must agree: `package.json`, `skill.json`,
`plugin/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`.
`pnpm manifest:lint` fails when they drift, and `pnpm verify` runs it.

## Releasing

1. `pnpm selftest && pnpm verify` — all green — then
   `node scripts/verify-template.mjs --template <id>` for every id in
   `references/templates.json` (CI runs the same as a matrix).
2. Bump the version in all four manifests **and every `skills/*/skill.json`**, write
   the `CHANGELOG.md` entry.
3. Commit, then tag `vMAJOR.MINOR.PATCH`.

A downstream marketplace may mirror this plugin; if one does, it re-pins from a
tag here rather than holding its own copy of the metadata.
