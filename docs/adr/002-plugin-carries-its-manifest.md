<!-- historical-pointers: this record quotes the machine-local paths it removes, which is what it decided -->

# ADR 002: The plugin carries its own manifest and marketplace listing

- Status: accepted
- Date: 2026-08-12
- Prompt-log: docs/specs/2026-08-12-production-grade-design.md

## Context

`plugin/README.md` stated that the distributable plugin lived in a different
repository — `~/work/agentic-os/plugins/proto-forge` — and that this directory was
"intentionally empty of manifests" so that plugin metadata had a single owner
elsewhere. `plugin/` contained no `plugin.json`, and the repository root contained
no `marketplace.json`.

Three consequences followed, and all three are defects rather than trade-offs:

- **The plugin was not installable from its own source.** A reader who cloned this
  repository, or found it on GitHub, could not install it; they had to know about a
  second repository whose path was written as a directory on the author's machine.
- **The stated owner of the metadata was unreachable.** "Single source of truth"
  only holds if the source can be reached. A pointer to `~/work/...` resolves for
  exactly one person.
- **Version drift had nowhere to be caught.** `skill.json` said `0.3.0`; whatever
  the other repository said was unverifiable from here.

The wider requirement this sits under is that the whole plugin must be standalone:
nothing it depends on may live outside the repository (spec §3).

## Decision

The plugin's identity lives here, in four files that must agree:

| File | States |
| --- | --- |
| `package.json` | the plugin-level gates and the version |
| `skill.json` | the engine |
| `plugin/.claude-plugin/plugin.json` | the installable, whose `skills` entry points back at the repository root |
| `.claude-plugin/marketplace.json` | the listing — exactly one plugin, sourced from `./plugin` |

`scripts/manifest-lint.mjs` fails the build on a name disagreement between any of
them, a version disagreement, a non-SemVer version, a marketplace listing that is
not exactly one entry, a `source` that is not a directory in this repository, or a
`skills` entry that resolves to no `SKILL.md`. It runs in `pnpm verify`.

`plugin/` holds no copy of the skill. The manifest points at the repository root,
because the skill *is* the plugin; duplicating `SKILL.md`, `references/` and
`template/` under `plugin/` would create exactly the drift this ADR closes.

A downstream marketplace may still mirror the plugin. If one does, it re-pins from
a tag here rather than holding its own metadata, so the direction of truth is
one-way and this repository is always the origin.

## Consequences

The repository installs itself (`/plugin marketplace add JirakJ/proto-forge`), and
a release is a mechanical four-file bump that a gate verifies rather than a ritual
someone remembers. `manifest-lint` becomes a step every release must pass, and the
four files must be edited together — which is the point, but it does mean a
version bump touches four files instead of one.

Because these files are gate configuration, editing them needs the guardrail's
human approval path (`/gate-unlock`) and this record. That friction is deliberate:
a manifest that can be quietly rewritten is a supply-chain surface.

## Alternatives considered

**Keep the manifest in the downstream marketplace repository.** The status quo, and
the defect: the plugin cannot be installed from its own source, and the metadata's
owner is a path on one machine.

**Duplicate the skill under `plugin/`.** Makes `plugin/` self-contained at the cost
of two copies of `SKILL.md`, `references/` and the whole `template/` tree. The copy
would drift, and nothing would catch it — a worse version of the problem being
fixed.

**Publish to npm and let a package manager own the metadata.** Adds a registry and
a publish step to a thing that is installed by cloning a repository, and still
leaves the marketplace listing to write. No benefit at this scale.
