# proto-forge — the installable plugin

This repository is the source of truth for proto-forge, and it installs directly:

```
/plugin marketplace add JirakJ/proto-forge
/plugin install proto-forge@proto-forge
```

`.claude-plugin/marketplace.json` at the repository root lists exactly one plugin,
sourced from the repository root (`"./"`). `.claude-plugin/plugin.json` beside it is
the manifest, and its `skills` entries name the skills inside the repository — the
root `SKILL.md` (`"./"`), `skills/discovery/`, `skills/survey/` and `skills/elicit/`
— with their `references/` and the ten `templates/`; the repository *is* the plugin,
so nothing is duplicated. Claude Code accepts only `./`-relative paths that stay
inside the plugin root, so an entry like `"../.."` fails validation and the plugin
never installs (ADR 026); `manifest:lint` rejects that shape.

Four files carry the version and must agree: `package.json`, `skill.json`,
`.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`.
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
